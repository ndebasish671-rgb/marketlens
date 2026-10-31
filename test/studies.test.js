import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wma, stochastic, stochRsi, williamsR, cci, roc, momentum, awesomeOscillator,
  adx, mfi, obv, accumulationDistribution, cmf, keltner, donchian, supertrend,
  parabolicSar, classicPivots, returnVolatility, fibonacciLevels, computeStudySeries
} from '../shared/studies.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function candles(n, fn) {
  return Array.from({ length: n }, (_, i) => {
    const close = fn(i);
    return { time: 1700000000 + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
  });
}
const up = candles(120, i => 100 + i);
const down = candles(120, i => 220 - i);
const flat = candles(80, () => 100);

test('wma weights recent values more heavily', () => {
  const out = wma([1, 2, 3, 4], 3);
  assert.equal(out[0], null);
  approx(out[2], 14 / 6);
  approx(out[3], 20 / 6);
});

test('stochastic reaches 100 when closes are at the rolling high', () => {
  const atHigh = up.map(c => ({ ...c, high: c.close }));
  const st = stochastic(atHigh);
  approx(st.k.at(-1), 100);
  approx(st.d.at(-1), 100);
});

test('stochRsi stays bounded', () => {
  const sr = stochRsi(up.map(c => c.close));
  for (const v of sr.k) if (v != null) assert.ok(v >= 0 && v <= 100);
});

test('Williams %R is 0 at the high and -100 at the low', () => {
  const atHigh = up.map(c => ({ ...c, high: c.close }));
  const atLow = down.map(c => ({ ...c, low: c.close }));
  assert.equal(williamsR(atHigh).at(-1), 0);
  assert.equal(williamsR(atLow).at(-1), -100);
});

test('CCI is positive in an uptrend and negative in a downtrend', () => {
  assert.ok(cci(up).at(-1) > 0);
  assert.ok(cci(down).at(-1) < 0);
});

test('ROC and momentum measure change over the configured lookback', () => {
  const values = [100, 101, 102, 110];
  approx(roc(values, 3).at(-1), 10);
  approx(momentum(values, 3).at(-1), 10);
});

test('Awesome Oscillator is positive when recent median prices rise', () => {
  assert.ok(awesomeOscillator(up).at(-1) > 0);
});

test('ADX distinguishes a strong trend from a flat market', () => {
  assert.ok(adx(up).adx.at(-1) > 25);
  assert.equal(adx(flat).adx.at(-1), 0);
});

test('MFI reaches extremes for one-sided money flow', () => {
  assert.equal(mfi(up).at(-1), 100);
  assert.equal(mfi(down).at(-1), 0);
});

test('OBV accumulates signed volume', () => {
  const data = [
    { close: 10, volume: 100 },
    { close: 11, volume: 200 },
    { close: 10.5, volume: 150 },
    { close: 10.5, volume: 500 }
  ];
  assert.deepEqual(obv(data), [0, 200, 50, 50]);
});

test('Accumulation/Distribution and CMF respond to close location', () => {
  const highClose = candles(30, () => 100).map(c => ({ ...c, close: c.high }));
  const lowClose = candles(30, () => 100).map(c => ({ ...c, close: c.low }));
  assert.ok(accumulationDistribution(highClose).at(-1) > 0);
  assert.ok(cmf(highClose).at(-1) > 0.9);
  assert.ok(cmf(lowClose).at(-1) < -0.9);
});

test('Keltner and Donchian channels surround price', () => {
  const k = keltner(up);
  const d = donchian(up);
  const i = up.length - 1;
  assert.ok(k.upper[i] > k.middle[i] && k.middle[i] > k.lower[i]);
  assert.ok(d.upper[i] >= up[i].close && d.lower[i] <= up[i].close);
});

test('SuperTrend sits below price in an uptrend and above in a downtrend', () => {
  const u = supertrend(up);
  const d = supertrend(down);
  assert.ok(u.line.at(-1) < up.at(-1).close);
  assert.ok(d.line.at(-1) > down.at(-1).close);
});

test('Parabolic SAR trails an uptrend below price', () => {
  const p = parabolicSar(up);
  assert.ok(p.sar.at(-1) < up.at(-1).close);
  assert.equal(p.trend.at(-1), 1);
});

test('classic pivots derive from the prior bar', () => {
  const data = [
    { high: 110, low: 90, close: 100 },
    { high: 111, low: 91, close: 101 }
  ];
  const p = classicPivots(data);
  approx(p.p[1], 100);
  approx(p.r1[1], 110);
  approx(p.s1[1], 90);
});

test('return volatility is zero for flat prices and positive for alternating prices', () => {
  assert.equal(returnVolatility(flat.map(c => c.close)).at(-1), 0);
  const alternating = candles(40, i => 100 + (i % 2) * 5).map(c => c.close);
  assert.ok(returnVolatility(alternating).at(-1) > 0);
});

test('fibonacci levels span the recent swing range', () => {
  const fib = fibonacciLevels(up, 60);
  approx(fib.levels[0].price, fib.high);
  approx(fib.levels.at(-1).price, fib.low);
  assert.equal(fib.levels.length, 7);
});

test('computeStudySeries returns aligned finite study values after warm-up', () => {
  const longUp = candles(260, i => 100 + i);
  const series = computeStudySeries(longUp, 'UTC');
  assert.equal(series.length, longUp.length);
  const last = series.at(-1);
  for (const key of ['sma200', 'ema9', 'stochK', 'williamsR', 'cci', 'adx', 'mfi', 'obv', 'cmf', 'supertrend', 'psar', 'pivotP', 'bbWidth', 'percentB', 'returnVol20']) {
    assert.ok(Number.isFinite(last[key]), `${key} should be finite`);
  }
  assert.equal(last.time, longUp.at(-1).time);
});
