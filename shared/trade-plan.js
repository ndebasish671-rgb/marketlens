// Educational, conditional entry/exit timing. This module never places orders,
// predicts a future price, or claims exchange-real-time data.
import { analyze, cleanCandles } from './indicators.js';

export const TIMING_VERSION = 1;
export const TIMING_STRATEGY = '20-bar confirmed breakout / breakdown';

function dayKey(ts, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
  } catch { return new Date(ts * 1000).toISOString().slice(0, 10); }
}

export function marketSessionState(quote, now = Date.now()) {
  const p = quote?.regularPeriod;
  if (!Number.isFinite(p?.start) || !Number.isFinite(p?.end)) return 'unknown';
  const seconds = now / 1000;
  return seconds >= p.start && seconds < p.end ? 'open' : 'closed';
}

// Signals are evaluated on completed bars only. The latest intraday bar is
// forming until its 5-minute window ends. A same-day daily bar is forming while
// the regular session is open; if the session is unknown, treat it as forming
// conservatively until the exchange-local date changes.
export function completedCandles(candles, { mode = 'swing', timeZone = 'UTC', quote = null, now = Date.now() } = {}) {
  const data = cleanCandles(candles);
  if (!data.length) return data;
  const last = data.at(-1);
  const session = marketSessionState(quote, now);
  let forming = false;
  if (mode === 'intraday') {
    forming = now / 1000 < last.time + 300;
  } else if (dayKey(last.time, timeZone) === dayKey(now / 1000, timeZone)) {
    const end = quote?.regularPeriod?.end;
    forming = Number.isFinite(end) ? now / 1000 < end : true;
  }
  return forming ? data.slice(0, -1) : data;
}

function unavailable(mode, reason, extra = {}) {
  return {
    version: TIMING_VERSION, mode, strategy: TIMING_STRATEGY,
    status: 'unavailable', action: 'Wait', label: 'Timing unavailable',
    bias: 'Unavailable', score: null, buyTrigger: null, sellTrigger: null,
    referencePrice: null, atr: null, riskReference: null, rewardReference: null,
    barTime: null, completedBars: 0, conditions: [], reason,
    buyRule: mode === 'intraday' ? 'Wait for a completed 5-minute bar to close above the buy trigger with trend, MACD and VWAP confirmation.' : 'Wait for a completed daily bar to close above the buy trigger with trend and MACD confirmation.',
    sellRule: mode === 'intraday' ? 'Watch for a completed 5-minute bar to close below the sell/exit trigger with trend, MACD and VWAP confirmation.' : 'Watch for a completed daily bar to close below the sell/exit trigger with trend and MACD confirmation.',
    ...extra
  };
}

export function buildTradePlan(candles, { mode = 'swing', timeZone = 'UTC', quote = null, now = Date.now(), stale = false, fetchedAt = null } = {}) {
  const session = marketSessionState(quote, now);
  const meta = {
    timeZone, stale: Boolean(stale), fetchedAt,
    quoteTime: Number.isFinite(quote?.marketTime) ? quote.marketTime : null,
    sourceDelayMinutes: Number.isFinite(quote?.sourceDelayMinutes) ? quote.sourceDelayMinutes : null,
    marketState: session,
    quoteSource: quote?.source || 'Yahoo Finance',
    historySource: 'Yahoo Finance'
  };
  const completed = completedCandles(candles, { mode, timeZone, quote, now });
  if (completed.length < 60) return unavailable(mode, `Needs at least 60 completed ${mode === 'intraday' ? '5-minute' : 'daily'} bars; received ${completed.length}.`, { ...meta, completedBars: completed.length, barTime: completed.at(-1)?.time ?? null });

  const analysis = analyze(completed, { mode, timeZone });
  const ind = analysis.indicators || {};
  const last = completed.at(-1);
  const prior = completed.slice(-21, -1);
  const buyTrigger = Math.max(...prior.map(c => c.high));
  const sellTrigger = Math.min(...prior.map(c => c.low));
  const eps = Math.max(Math.abs(ind.macd ?? 0), Math.abs(ind.macdSignal ?? 0), 1) * 1e-9;
  const macdDiff = ind.macd != null && ind.macdSignal != null ? ind.macd - ind.macdSignal : null;
  const conditions = [
    { id: 'breakout', side: 'buy', label: 'Close above prior 20-bar high', met: last.close > buyTrigger, detail: `Completed close ${last.close.toFixed(2)} vs buy trigger ${buyTrigger.toFixed(2)}.` },
    { id: 'trend', side: 'buy', label: 'Close above SMA 20', met: ind.sma20 != null && last.close > ind.sma20, detail: 'Price must be above the 20-bar simple moving average.' },
    { id: 'macd', side: 'buy', label: 'MACD above signal line', met: macdDiff != null && macdDiff > eps, detail: 'MACD momentum must be positive on the completed bar.' },
    { id: 'breakdown', side: 'sell', label: 'Close below prior 20-bar low', met: last.close < sellTrigger, detail: `Completed close ${last.close.toFixed(2)} vs sell/exit trigger ${sellTrigger.toFixed(2)}.` },
    { id: 'trend', side: 'sell', label: 'Close below SMA 20', met: ind.sma20 != null && last.close < ind.sma20, detail: 'Price must be below the 20-bar simple moving average.' },
    { id: 'macd', side: 'sell', label: 'MACD below signal line', met: macdDiff != null && macdDiff < -eps, detail: 'MACD momentum must be negative on the completed bar.' }
  ];
  if (mode === 'intraday') {
    conditions.push(
      { id: 'vwap', side: 'buy', label: 'Close above session VWAP', met: ind.vwap != null && last.close > ind.vwap, detail: 'Price must be above the session volume-weighted average price.' },
      { id: 'vwap', side: 'sell', label: 'Close below session VWAP', met: ind.vwap != null && last.close < ind.vwap, detail: 'Price must be below the session volume-weighted average price.' }
    );
  }
  const buyMet = conditions.filter(c => c.side === 'buy').every(c => c.met);
  const sellMet = conditions.filter(c => c.side === 'sell').every(c => c.met);
  const status = buyMet ? 'buy' : sellMet ? 'sell' : 'wait';
  const action = buyMet ? 'Buy' : sellMet ? 'Sell' : 'Wait';
  const label = buyMet ? 'Buy conditions met' : sellMet ? 'Sell/exit conditions met' : 'Wait for confirmation';
  const atr = Number.isFinite(ind.atr) ? ind.atr : null;
  const riskReference = buyMet && atr != null ? Math.max(0, last.close - 1.5 * atr) : null;
  const rewardReference = buyMet && atr != null ? last.close + 3 * atr : null;
  const barLabel = mode === 'intraday' ? '5-minute' : 'daily';
  const confirmation = mode === 'intraday' ? 'trend, MACD and VWAP' : 'trend and MACD';
  let reason = `No confirmed buy or sell/exit close on the last completed ${barLabel} bar. Levels are recalculated after each completed bar.`;
  if (buyMet) reason = `The last completed ${barLabel} bar closed above the prior 20-bar high with ${confirmation} confirmation. This is a historical condition match, not a prediction.`;
  if (sellMet) reason = `The last completed ${barLabel} bar closed below the prior 20-bar low with ${confirmation} confirmation. “Sell” here means a bearish/exit watch, not a short-sale instruction.`;
  if (stale) reason = `Cached data: ${reason} Do not treat this as a new live trigger.`;
  else if (session === 'closed') reason = `Market closed: ${reason} No new regular-session trigger is expected until the market reopens.`;

  return {
    version: TIMING_VERSION, mode, strategy: TIMING_STRATEGY,
    status, action, label, bias: analysis.verdict, score: analysis.score,
    buyTrigger, sellTrigger, referencePrice: last.close, atr,
    riskReference, rewardReference,
    riskExample: buyMet && atr != null ? 'Educational long-only example: invalidation 1.5×ATR below the completed close; 2R reference 3×ATR above. Not a recommended stop or target.' : null,
    barTime: last.time, completedBars: completed.length, conditions, reason,
    buyRule: `A completed ${barLabel} bar closes above the prior 20-bar high, above SMA 20, with positive MACD${mode === 'intraday' ? ' and above session VWAP' : ''}.`,
    sellRule: `A completed ${barLabel} bar closes below the prior 20-bar low, below SMA 20, with negative MACD${mode === 'intraday' ? ' and below session VWAP' : ''}.`,
    nextCheck: `Auto-check about every 60 seconds; timing changes only after a completed ${barLabel} bar.`,
    disclaimer: 'Educational rule match only. Not investment advice, not a forecast, and not an order. Data may be delayed.',
    ...meta
  };
}

export function buildTimingSet({ daily, intraday, quote, now = Date.now(), dailyStale = false, intradayStale = false, dailyFetchedAt = null, intradayFetchedAt = null }) {
  const timeZone = quote?.timezone || 'UTC';
  return {
    swing: buildTradePlan(daily, { mode: 'swing', timeZone, quote, now, stale: dailyStale, fetchedAt: dailyFetchedAt }),
    intraday: buildTradePlan(intraday, { mode: 'intraday', timeZone, quote, now, stale: intradayStale, fetchedAt: intradayFetchedAt })
  };
}

export function timingBadge(plan) {
  if (!plan || plan.status === 'unavailable') return { text: 'Unavailable', tone: 'neutral' };
  if (plan.stale) return { text: 'Cached signal', tone: 'warn' };
  if (plan.status === 'buy') return { text: plan.marketState === 'closed' ? 'Buy setup · last session' : 'Buy conditions met', tone: 'buy' };
  if (plan.status === 'sell') return { text: plan.marketState === 'closed' ? 'Sell/exit setup · last session' : 'Sell/exit conditions met', tone: 'sell' };
  return { text: plan.marketState === 'closed' ? 'Wait · market closed' : 'Wait for confirmation', tone: 'neutral' };
}
