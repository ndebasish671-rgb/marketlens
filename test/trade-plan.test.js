import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradePlan, completedCandles, timingBadge, marketSessionState } from '../shared/trade-plan.js';

const DAY = 86400;
const start = 1700000000;
function bar(i, close, high = close + 0.5, low = close - 0.5) {
  return { time: start + i * DAY, open: close, high, low, close, volume: 1000 };
}
function breakoutSeries(direction = 1) {
  const out = [];
  for (let i = 0; i < 60; i++) out.push(bar(i, 100));
  for (let i = 60; i < 79; i++) out.push(bar(i, direction === 1 ? 100 + (i - 59) * 0.5 : 100 - (i - 59) * 0.5));
  out.push(bar(79, direction === 1 ? 120 : 80, direction === 1 ? 121 : 81, direction === 1 ? 119 : 79));
  return out;
}
const now = start + 200 * DAY;
const closedQuote = { timezone: 'UTC', marketTime: start + 79 * DAY, regularPeriod: { start: start + 79 * DAY, end: start + 79 * DAY + 23400 }, source: 'Yahoo Finance' };

test('buy timing requires a completed close above the prior 20-bar high with confirmation', () => {
  const plan = buildTradePlan(breakoutSeries(1), { mode: 'swing', quote: closedQuote, now });
  assert.equal(plan.status, 'buy');
  assert.equal(plan.action, 'Buy');
  assert.ok(plan.buyTrigger < plan.referencePrice);
  assert.ok(plan.conditions.filter(c => c.side === 'buy').every(c => c.met));
  assert.match(plan.reason, /not a prediction/);
});

test('sell/exit timing requires a completed close below the prior 20-bar low with confirmation', () => {
  const plan = buildTradePlan(breakoutSeries(-1), { mode: 'swing', quote: closedQuote, now });
  assert.equal(plan.status, 'sell');
  assert.equal(plan.action, 'Sell');
  assert.ok(plan.sellTrigger > plan.referencePrice);
  assert.ok(plan.conditions.filter(c => c.side === 'sell').every(c => c.met));
});

test('a flat market waits instead of inventing a trigger', () => {
  const candles = Array.from({ length: 80 }, (_, i) => bar(i, 100));
  const plan = buildTradePlan(candles, { mode: 'swing', quote: closedQuote, now });
  assert.equal(plan.status, 'wait');
  assert.equal(plan.action, 'Wait');
});

test('forming intraday bars are excluded from timing', () => {
  const candles = breakoutSeries(1).map((c, i) => ({ ...c, time: start + i * 300 }));
  const last = candles.at(-1);
  const formingNow = (last.time + 100) * 1000;
  const completed = completedCandles(candles, { mode: 'intraday', now: formingNow });
  assert.equal(completed.at(-1).time, candles.at(-2).time);
  const plan = buildTradePlan(candles, { mode: 'intraday', now: formingNow, quote: { timezone: 'UTC' } });
  assert.notEqual(plan.barTime, last.time);
  assert.notEqual(plan.status, 'buy');
});

test('same-day daily bars are excluded while the regular session is open', () => {
  const candles = breakoutSeries(1);
  const last = candles.at(-1);
  const quote = { timezone: 'UTC', regularPeriod: { start: last.time, end: last.time + 23400 } };
  const plan = buildTradePlan(candles, { mode: 'swing', quote, now: (last.time + 1000) * 1000 });
  assert.notEqual(plan.barTime, last.time);
  assert.notEqual(plan.status, 'buy');
});

test('stale data is labeled and not presented as a new live trigger', () => {
  const plan = buildTradePlan(breakoutSeries(1), { mode: 'swing', quote: closedQuote, now, stale: true });
  assert.equal(plan.stale, true);
  assert.match(plan.reason, /Cached data/);
  assert.equal(timingBadge(plan).tone, 'warn');
});

test('closed-market buy matches are labeled as last-session setups', () => {
  const plan = buildTradePlan(breakoutSeries(1), { mode: 'swing', quote: closedQuote, now });
  assert.equal(marketSessionState(closedQuote, now), 'closed');
  assert.match(timingBadge(plan).text, /last session/);
});

test('insufficient completed history returns unavailable, not a fake signal', () => {
  const plan = buildTradePlan(breakoutSeries(1).slice(0, 20), { mode: 'swing', quote: closedQuote, now });
  assert.equal(plan.status, 'unavailable');
  assert.equal(plan.buyTrigger, null);
  assert.equal(plan.sellTrigger, null);
});

test('educational risk example keeps a 2R reference relative to invalidation', () => {
  const plan = buildTradePlan(breakoutSeries(1), { mode: 'swing', quote: closedQuote, now });
  assert.ok(plan.atr > 0);
  assert.ok(plan.riskReference < plan.referencePrice);
  assert.ok(plan.rewardReference > plan.referencePrice);
  const risk = plan.referencePrice - plan.riskReference;
  const reward = plan.rewardReference - plan.referencePrice;
  assert.ok(Math.abs(reward - 2 * risk) < 1e-9);
});
