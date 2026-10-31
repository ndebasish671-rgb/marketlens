import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, atr, sessionVwap, cleanCandles, analyze } from '../shared/indicators.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sma computes rolling mean and leaves warm-up null', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([1, null, 3, 4], 2), [null, null, null, 3.5]);
});

test('ema seeds with SMA then recurses', () => {
  const out = ema([1, 2, 3, 4, 5], 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  approx(out[2], 2);
  approx(out[3], 4 * 0.5 + 2 * 0.5);
  approx(out[4], 5 * 0.5 + 3 * 0.5);
});

test('rsi handles flat, all-up and mixed series', () => {
  assert.equal(rsi(Array(20).fill(10))[19], 50);
  assert.equal(rsi(Array.from({ length: 20 }, (_, i) => i + 1))[19], 100);
  const mixed = rsi([44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28]);
  assert.ok(mixed[14] > 65 && mixed[14] < 75);
});

test('macd line equals fast EMA minus slow EMA once warmed up', () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + i + Math.sin(i / 3) * 2);
  const m = macd(values);
  const f = ema(values, 12);
  const s = ema(values, 26);
  for (let i = 25; i < values.length; i++) approx(m.line[i], f[i] - s[i]);
  assert.ok(m.signal[33] != null);
  approx(m.histogram[40], m.line[40] - m.signal[40]);
});

test('bollinger bands widen with volatility and stay symmetric', () => {
  const calm = Array.from({ length: 30 }, (_, i) => 100 + (i % 2) * 0.1);
  const wild = Array.from({ length: 30 }, (_, i) => 100 + (i % 2) * 5);
  const b1 = bollinger(calm);
  const b2 = bollinger(wild);
  approx(b1.upper[29] - b1.middle[29], b1.middle[29] - b1.lower[29]);
  assert.ok(b2.upper[29] - b2.lower[29] > b1.upper[29] - b1.lower[29]);
});

test('atr uses true range including gaps', () => {
  const candles = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 100, high: 102, low: 98, close: 100, volume: 10 }));
  candles[15] = { time: 15, open: 110, high: 112, low: 108, close: 110, volume: 10 };
  const out = atr(candles);
  assert.ok(out[15] > out[14]);
});

test('session VWAP resets between exchange days', () => {
  const candles = [
    { time: 1793367000, high: 11, low: 9, close: 10, volume: 100 },
    { time: 1793367300, high: 21, low: 19, close: 20, volume: 100 },
    { time: 1793453400, high: 31, low: 29, close: 30, volume: 100 }
  ];
  const out = sessionVwap(candles, 'America/New_York');
  approx(out[0], 10);
  approx(out[1], 15);
  approx(out[2], 30);
});

test('cleanCandles sorts, dedupes and drops invalid rows', () => {
  const input = [
    { time: 3, open: 1, high: 2, low: 0.5, close: 1.5, volume: 5 },
    { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 5 },
    { time: 1, open: 9, high: 9, low: 9, close: 9, volume: 5 },
    { time: 2, open: 1, high: 2, low: 0.5, close: null, volume: 5 }
  ];
  const out = cleanCandles(input);
  assert.deepEqual(out.map(c => c.time), [1, 3]);
  assert.equal(out[0].close, 1.5);
});

function trending(dir) {
  return Array.from({ length: 120 }, (_, i) => {
    const close = 100 + dir * i * 0.8;
    const volume = i === 119 ? 6000 : 1000;
    return { time: 1700000000 + i * 86400, open: close - dir * 0.2, high: close + 0.5, low: close - 0.5, close, volume };
  });
}

test('analyze produces a Buy setup for a strong aligned uptrend', () => {
  const a = analyze(trending(1), { mode: 'swing', timeZone: 'UTC' });
  assert.equal(a.verdict, 'Buy');
  assert.ok(a.score >= 67);
  assert.equal(a.rules.length, 5);
  assert.ok(a.indicators.sma20 > a.indicators.sma50);
});

test('analyze produces a Sell setup for a strong aligned downtrend', () => {
  const a = analyze(trending(-1), { mode: 'swing', timeZone: 'UTC' });
  // RSI mean-reversion may oppose momentum; net score should still lean bearish.
  assert.ok(a.score <= 33);
  assert.equal(a.verdict, 'Sell');
});

test('analyze refuses insufficient history instead of inventing a signal', () => {
  const a = analyze(trending(1).slice(0, 20), { mode: 'swing' });
  assert.equal(a.verdict, 'Unavailable');
  assert.equal(a.score, null);
});

test('intraday analysis includes six rules and VWAP', () => {
  const candles = Array.from({ length: 120 }, (_, i) => {
    const close = 100 + Math.sin(i / 8) * 2;
    return { time: 1793367000 + i * 300, open: close, high: close + 0.3, low: close - 0.3, close, volume: 1000 };
  });
  const a = analyze(candles, { mode: 'intraday', timeZone: 'America/New_York' });
  assert.equal(a.rules.length, 6);
  assert.ok(a.rules.some(r => r.id === 'vwap'));
  assert.ok(a.indicators.vwap != null);
});
