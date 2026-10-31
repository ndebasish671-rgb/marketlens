// Essential technical-analysis studies. Pure functions; no network, no advice.
// These are informational by default and do not change the existing signal score.
import { cleanCandles, computeSeries, sma, ema, rsi, atr } from './indicators.js';

const finite = Number.isFinite;
const nullArray = n => new Array(n).fill(null);

export function wma(values, period) {
  const out = nullArray(values.length);
  const weightSum = period * (period + 1) / 2;
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    if (!window.every(finite)) continue;
    out[i] = window.reduce((sum, v, j) => sum + v * (j + 1), 0) / weightSum;
  }
  return out;
}

function rolling(values, period, fn) {
  const out = nullArray(values.length);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    if (window.every(finite)) out[i] = fn(window);
  }
  return out;
}

export function stochastic(candles, kPeriod = 14, smoothK = 3, smoothD = 3) {
  const raw = nullArray(candles.length);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    raw[i] = high === low ? 50 : 100 * (candles[i].close - low) / (high - low);
  }
  const k = sma(raw, smoothK);
  const d = sma(k, smoothD);
  return { raw, k, d };
}

export function stochRsi(values, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const r = rsi(values, rsiPeriod);
  const raw = nullArray(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < stochPeriod - 1) continue;
    const window = r.slice(i - stochPeriod + 1, i + 1);
    if (!window.every(finite)) continue;
    const high = Math.max(...window);
    const low = Math.min(...window);
    raw[i] = high === low ? 50 : 100 * (r[i] - low) / (high - low);
  }
  const k = sma(raw, smoothK);
  const d = sma(k, smoothD);
  return { raw, k, d };
}

export function williamsR(candles, period = 14) {
  const out = nullArray(candles.length);
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const value = high === low ? -50 : -100 * (high - candles[i].close) / (high - low);
    out[i] = value === 0 ? 0 : value;
  }
  return out;
}

export function cci(candles, period = 20) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3);
  const mean = sma(tp, period);
  const md = rolling(tp, period, w => {
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    return w.reduce((a, b) => a + Math.abs(b - m), 0) / w.length;
  });
  return tp.map((v, i) => mean[i] == null || md[i] == null ? null : md[i] === 0 ? 0 : (v - mean[i]) / (0.015 * md[i]));
}

export function roc(values, period = 12) {
  return values.map((v, i) => i >= period && finite(values[i - period]) && values[i - period] !== 0 && finite(v) ? (v / values[i - period] - 1) * 100 : null);
}

export function momentum(values, period = 10) {
  return values.map((v, i) => i >= period && finite(values[i - period]) && finite(v) ? v - values[i - period] : null);
}

export function awesomeOscillator(candles) {
  const tp = candles.map(c => (c.high + c.low) / 2);
  const fast = sma(tp, 5);
  const slow = sma(tp, 34);
  return tp.map((_, i) => fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null);
}

export function adx(candles, period = 14) {
  const n = candles.length;
  const plusDI = nullArray(n), minusDI = nullArray(n), adxOut = nullArray(n), dxArr = nullArray(n);
  if (n <= period) return { plusDI, minusDI, adx: adxOut };
  let sTR = 0, sP = 0, sM = 0;
  const dxValues = [];
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    const pDM = up > down && up > 0 ? up : 0;
    const mDM = down > up && down > 0 ? down : 0;
    const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    if (i <= period) {
      sTR += tr; sP += pDM; sM += mDM;
      if (i < period) continue;
    } else {
      sTR = sTR - sTR / period + tr;
      sP = sP - sP / period + pDM;
      sM = sM - sM / period + mDM;
    }
    plusDI[i] = sTR === 0 ? 0 : 100 * sP / sTR;
    minusDI[i] = sTR === 0 ? 0 : 100 * sM / sTR;
    const sum = plusDI[i] + minusDI[i];
    const dx = sum === 0 ? 0 : 100 * Math.abs(plusDI[i] - minusDI[i]) / sum;
    dxArr[i] = dx;
    dxValues.push(dx);
    if (dxValues.length === period) {
      adxOut[i] = dxValues.reduce((a, b) => a + b, 0) / period;
    } else if (dxValues.length > period) {
      adxOut[i] = (adxOut[i - 1] * (period - 1) + dx) / period;
    }
  }
  return { plusDI, minusDI, adx: adxOut };
}

export function mfi(candles, period = 14) {
  const n = candles.length;
  const out = nullArray(n);
  const tp = candles.map(c => (c.high + c.low + c.close) / 3);
  const pos = nullArray(n), neg = nullArray(n), vol = candles.map(c => finite(c.volume) ? c.volume : 0);
  for (let i = 1; i < n; i++) {
    const flow = tp[i] * vol[i];
    pos[i] = tp[i] > tp[i - 1] ? flow : 0;
    neg[i] = tp[i] < tp[i - 1] ? flow : 0;
  }
  for (let i = period; i < n; i++) {
    let p = 0, m = 0, v = 0;
    for (let j = i - period + 1; j <= i; j++) { p += pos[j] || 0; m += neg[j] || 0; v += vol[j]; }
    if (v <= 0) { out[i] = null; continue; }
    out[i] = m === 0 ? (p === 0 ? 50 : 100) : 100 - 100 / (1 + p / m);
  }
  return out;
}

export function obv(candles) {
  const out = nullArray(candles.length);
  if (!candles.length) return out;
  out[0] = 0;
  for (let i = 1; i < candles.length; i++) {
    const v = finite(candles[i].volume) ? candles[i].volume : 0;
    out[i] = out[i - 1] + (candles[i].close > candles[i - 1].close ? v : candles[i].close < candles[i - 1].close ? -v : 0);
  }
  return out;
}

export function accumulationDistribution(candles) {
  const out = nullArray(candles.length);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const clv = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
    sum += clv * (finite(c.volume) ? c.volume : 0);
    out[i] = sum;
  }
  return out;
}

export function cmf(candles, period = 20) {
  const out = nullArray(candles.length);
  const mfv = candles.map(c => {
    const range = c.high - c.low;
    const clv = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
    return clv * (finite(c.volume) ? c.volume : 0);
  });
  for (let i = period - 1; i < candles.length; i++) {
    let flow = 0, vol = 0;
    for (let j = i - period + 1; j <= i; j++) { flow += mfv[j]; vol += finite(candles[j].volume) ? candles[j].volume : 0; }
    out[i] = vol === 0 ? null : flow / vol;
  }
  return out;
}

export function keltner(candles, period = 20, mult = 2) {
  const middle = ema(candles.map(c => c.close), period);
  const a = atr(candles, period);
  return {
    middle,
    upper: middle.map((v, i) => v != null && a[i] != null ? v + mult * a[i] : null),
    lower: middle.map((v, i) => v != null && a[i] != null ? v - mult * a[i] : null)
  };
}

export function donchian(candles, period = 20) {
  const upper = rolling(candles.map(c => c.high), period, w => Math.max(...w));
  const lower = rolling(candles.map(c => c.low), period, w => Math.min(...w));
  return { upper, lower, middle: upper.map((v, i) => v != null && lower[i] != null ? (v + lower[i]) / 2 : null) };
}

export function supertrend(candles, period = 10, mult = 3) {
  const n = candles.length;
  const line = nullArray(n), up = nullArray(n), down = nullArray(n), direction = nullArray(n);
  const a = atr(candles, period);
  let finalUpper = null, finalLower = null, dir = 1;
  for (let i = 0; i < n; i++) {
    if (a[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + mult * a[i];
    const basicLower = hl2 - mult * a[i];
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    finalUpper = finalUpper == null || basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = finalLower == null || basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
    if (direction[i - 1] != null) dir = direction[i - 1];
    if (dir === 1 && candles[i].close < finalLower) dir = -1;
    else if (dir === -1 && candles[i].close > finalUpper) dir = 1;
    direction[i] = dir;
    line[i] = dir === 1 ? finalLower : finalUpper;
    up[i] = dir === 1 ? line[i] : null;
    down[i] = dir === -1 ? line[i] : null;
  }
  return { line, up, down, direction };
}

export function parabolicSar(candles, step = 0.02, max = 0.2) {
  const n = candles.length;
  const sar = nullArray(n), trend = nullArray(n);
  if (n < 2) return { sar, trend };
  let up = candles[1].close >= candles[0].close;
  let sarVal = up ? candles[0].low : candles[0].high;
  let ep = up ? candles[0].high : candles[0].low;
  let af = step;
  sar[0] = sarVal; trend[0] = up ? 1 : -1;
  for (let i = 1; i < n; i++) {
    sarVal = sarVal + af * (ep - sarVal);
    if (up) {
      sarVal = Math.min(sarVal, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low);
      if (candles[i].low < sarVal) {
        up = false; sarVal = ep; ep = candles[i].low; af = step;
      } else if (candles[i].high > ep) {
        ep = candles[i].high; af = Math.min(af + step, max);
      }
    } else {
      sarVal = Math.max(sarVal, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high);
      if (candles[i].high > sarVal) {
        up = true; sarVal = ep; ep = candles[i].high; af = step;
      } else if (candles[i].low < ep) {
        ep = candles[i].low; af = Math.min(af + step, max);
      }
    }
    sar[i] = sarVal; trend[i] = up ? 1 : -1;
  }
  return { sar, trend };
}

export function classicPivots(candles) {
  const n = candles.length;
  const p = nullArray(n), r1 = nullArray(n), s1 = nullArray(n), r2 = nullArray(n), s2 = nullArray(n), r3 = nullArray(n), s3 = nullArray(n);
  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1];
    const P = (prev.high + prev.low + prev.close) / 3;
    p[i] = P;
    r1[i] = 2 * P - prev.low;
    s1[i] = 2 * P - prev.high;
    r2[i] = P + (prev.high - prev.low);
    s2[i] = P - (prev.high - prev.low);
    r3[i] = prev.high + 2 * (P - prev.low);
    s3[i] = prev.low - 2 * (prev.high - P);
  }
  return { p, r1, s1, r2, s2, r3, s3 };
}

export function returnVolatility(values, period = 20) {
  const returns = values.map((v, i) => i > 0 && finite(v) && finite(values[i - 1]) && values[i - 1] > 0 ? Math.log(v / values[i - 1]) : null);
  return rolling(returns, period, w => {
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    return Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length) * 100;
  });
}

export function fibonacciLevels(candles, lookback = 60) {
  const data = candles.slice(-lookback);
  if (!data.length) return null;
  const high = Math.max(...data.map(c => c.high));
  const low = Math.min(...data.map(c => c.low));
  const diff = high - low;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return { high, low, lookback: data.length, levels: ratios.map(r => ({ ratio: r, price: high - diff * r })) };
}

export function computeStudySeries(candles, timeZone = 'UTC') {
  const data = cleanCandles(candles);
  const base = computeSeries(data, timeZone);
  const closes = data.map(c => c.close);
  const volumes = data.map(c => c.volume);
  const st = stochastic(data);
  const sr = stochRsi(closes);
  const wr = williamsR(data);
  const cciVals = cci(data);
  const rocVals = roc(closes, 12);
  const momVals = momentum(closes, 10);
  const ao = awesomeOscillator(data);
  const dmi = adx(data);
  const mfiVals = mfi(data);
  const obvVals = obv(data);
  const adVals = accumulationDistribution(data);
  const cmfVals = cmf(data);
  const kel = keltner(data);
  const don = donchian(data);
  const superT = supertrend(data);
  const psar = parabolicSar(data);
  const piv = classicPivots(data);
  const volSma = sma(volumes, 20);
  const relVol = volumes.map((v, i) => volSma[i] > 0 ? v / volSma[i] : null);
  const retVol = returnVolatility(closes, 20);
  const bbWidth = base.map(s => s.bbUpper != null && s.bbLower != null && s.bbMiddle ? (s.bbUpper - s.bbLower) / s.bbMiddle * 100 : null);
  const percentB = base.map((s, i) => s.bbUpper != null && s.bbLower != null && s.bbUpper !== s.bbLower ? (closes[i] - s.bbLower) / (s.bbUpper - s.bbLower) : null);
  const sma200 = sma(closes, 200), ema9 = ema(closes, 9), ema50 = ema(closes, 50), ema200 = ema(closes, 200), wma20 = wma(closes, 20);
  return data.map((c, i) => ({
    ...base[i],
    sma200: sma200[i], ema9: ema9[i], ema50: ema50[i], ema200: ema200[i], wma20: wma20[i],
    stochK: st.k[i], stochD: st.d[i], stochRsiK: sr.k[i], stochRsiD: sr.d[i],
    williamsR: wr[i], cci: cciVals[i], roc12: rocVals[i], momentum10: momVals[i], awesomeOscillator: ao[i],
    adx: dmi.adx[i], plusDI: dmi.plusDI[i], minusDI: dmi.minusDI[i],
    mfi: mfiVals[i], obv: obvVals[i], adLine: adVals[i], cmf: cmfVals[i],
    volumeSma20: volSma[i], relativeVolume: relVol[i],
    keltnerUpper: kel.upper[i], keltnerMiddle: kel.middle[i], keltnerLower: kel.lower[i],
    donchianUpper: don.upper[i], donchianMiddle: don.middle[i], donchianLower: don.lower[i],
    supertrend: superT.line[i], supertrendUp: superT.up[i], supertrendDown: superT.down[i], supertrendDirection: superT.direction[i],
    psar: psar.sar[i], psarTrend: psar.trend[i],
    pivotP: piv.p[i], pivotR1: piv.r1[i], pivotS1: piv.s1[i], pivotR2: piv.r2[i], pivotS2: piv.s2[i], pivotR3: piv.r3[i], pivotS3: piv.s3[i],
    returnVol20: retVol[i], bbWidth: bbWidth[i], percentB: percentB[i],
    atrPercent: base[i].atr != null && c.close > 0 ? base[i].atr / c.close * 100 : null
  }));
}

export const STUDY_GROUPS = ['Trend', 'Momentum', 'Volume', 'Volatility', 'Levels'];

export const SUB_STUDIES = [
  { id: 'rsi', name: 'RSI (14)', group: 'Momentum', description: 'Momentum oscillator. Below 30 is oversold; above 70 is overbought. Extremes can persist in strong trends.', lines: [{ key: 'rsi', label: 'RSI', color: '#8b5cf6' }], references: [30, 50, 70], min: 0, max: 100 },
  { id: 'macd', name: 'MACD (12,26,9)', group: 'Momentum', description: 'Trend-momentum difference between fast and slow EMAs. Histogram shows MACD minus signal.', lines: [{ key: 'macd', label: 'MACD', color: '#6b8afd' }, { key: 'macdSignal', label: 'Signal', color: '#e3a23c' }], histogram: { key: 'histogram', label: 'Histogram' }, references: [0] },
  { id: 'stochastic', name: 'Stochastic (14,3,3)', group: 'Momentum', description: 'Close position within the recent range. Below 20 is oversold; above 80 is overbought.', lines: [{ key: 'stochK', label: '%K', color: '#0ea5e9' }, { key: 'stochD', label: '%D', color: '#f59e0b' }], references: [20, 50, 80], min: 0, max: 100 },
  { id: 'stochRsi', name: 'StochRSI (14,14,3,3)', group: 'Momentum', description: 'Stochastic applied to RSI. More sensitive than RSI; useful for timing, but noisier.', lines: [{ key: 'stochRsiK', label: '%K', color: '#8b5cf6' }, { key: 'stochRsiD', label: '%D', color: '#f59e0b' }], references: [20, 80], min: 0, max: 100 },
  { id: 'williamsR', name: 'Williams %R (14)', group: 'Momentum', description: 'Close position relative to the recent high. Below -80 is oversold; above -20 is overbought.', lines: [{ key: 'williamsR', label: '%R', color: '#ef6b73' }], references: [-80, -50, -20], min: -100, max: 0 },
  { id: 'cci', name: 'CCI (20)', group: 'Momentum', description: 'Deviation from average typical price. Above +100 / below -100 flags extended conditions.', lines: [{ key: 'cci', label: 'CCI', color: '#10a779' }], references: [-100, 0, 100] },
  { id: 'roc', name: 'Rate of Change (12)', group: 'Momentum', description: 'Percent price change over 12 bars. Positive values indicate upward momentum.', lines: [{ key: 'roc12', label: 'ROC %', color: '#0ea5e9' }], references: [0] },
  { id: 'momentum', name: 'Momentum (10)', group: 'Momentum', description: 'Absolute price change over 10 bars.', lines: [{ key: 'momentum10', label: 'Momentum', color: '#6b8afd' }], references: [0] },
  { id: 'awesome', name: 'Awesome Oscillator', group: 'Momentum', description: '5-bar minus 34-bar SMA of median price. Crosses around zero show momentum shifts.', histogram: { key: 'awesomeOscillator', label: 'AO' }, references: [0] },
  { id: 'adx', name: 'ADX / DMI (14)', group: 'Trend', description: 'ADX measures trend strength, not direction. +DI/-DI show directional pressure. ADX above 25 often indicates a stronger trend.', lines: [{ key: 'adx', label: 'ADX', color: '#111e24' }, { key: 'plusDI', label: '+DI', color: '#10a779' }, { key: 'minusDI', label: '-DI', color: '#ef6b73' }], references: [20, 25, 50], min: 0, max: 100 },
  { id: 'mfi', name: 'Money Flow Index (14)', group: 'Volume', description: 'Volume-weighted RSI. Below 20 is oversold; above 80 is overbought. Requires volume data.', lines: [{ key: 'mfi', label: 'MFI', color: '#0ea5e9' }], references: [20, 50, 80], min: 0, max: 100 },
  { id: 'obv', name: 'On-Balance Volume', group: 'Volume', description: 'Cumulative volume added on up closes and subtracted on down closes. Rising OBV can confirm buying pressure.', lines: [{ key: 'obv', label: 'OBV', color: '#10a779' }] },
  { id: 'ad', name: 'Accumulation / Distribution', group: 'Volume', description: 'Cumulative close-location volume flow. Rising values suggest accumulation within the bar range.', lines: [{ key: 'adLine', label: 'A/D', color: '#6b8afd' }] },
  { id: 'cmf', name: 'Chaikin Money Flow (20)', group: 'Volume', description: '20-bar money-flow volume normalized by volume. Above zero suggests accumulation; below zero distribution.', lines: [{ key: 'cmf', label: 'CMF', color: '#8b5cf6' }], references: [-0.2, 0, 0.2] },
  { id: 'relativeVolume', name: 'Relative Volume (20)', group: 'Volume', description: 'Current volume divided by its 20-bar average. Above 1.5 is elevated participation.', histogram: { key: 'relativeVolume', label: 'RVOL' }, references: [1, 1.5] },
  { id: 'atr', name: 'Average True Range (14)', group: 'Volatility', description: 'Average bar range including gaps. Measures volatility, not direction.', lines: [{ key: 'atr', label: 'ATR', color: '#f59e0b' }] },
  { id: 'atrPercent', name: 'ATR %', group: 'Volatility', description: 'ATR as a percent of price, useful for comparing volatility across stocks.', lines: [{ key: 'atrPercent', label: 'ATR %', color: '#f59e0b' }] },
  { id: 'bbWidth', name: 'Bollinger Band Width', group: 'Volatility', description: 'Band width relative to the middle band. Low width can precede expansion; high width means elevated volatility.', lines: [{ key: 'bbWidth', label: 'Band width %', color: '#9aa8b5' }] },
  { id: 'percentB', name: 'Bollinger %B', group: 'Volatility', description: 'Close position within Bollinger Bands. 0 is lower band, 1 is upper band.', lines: [{ key: 'percentB', label: '%B', color: '#0ea5e9' }], references: [0, 0.5, 1] },
  { id: 'returnVol', name: '20-bar Return Volatility', group: 'Volatility', description: 'Standard deviation of log returns over 20 bars, in percent. Not annualized.', lines: [{ key: 'returnVol20', label: 'Vol %', color: '#ef6b73' }] }
];

export const PRICE_OVERLAYS = [
  { id: 'sma20', label: 'SMA 20', keys: ['sma20'], color: '#e3a23c' },
  { id: 'sma50', label: 'SMA 50', keys: ['sma50'], color: '#6b8afd' },
  { id: 'sma200', label: 'SMA 200', keys: ['sma200'], color: '#111e24' },
  { id: 'ema9', label: 'EMA 9', keys: ['ema9'], color: '#10a779' },
  { id: 'ema20', label: 'EMA 20', keys: ['ema20'], color: '#a78bfa' },
  { id: 'ema50', label: 'EMA 50', keys: ['ema50'], color: '#0ea5e9' },
  { id: 'ema200', label: 'EMA 200', keys: ['ema200'], color: '#ef6b73' },
  { id: 'wma20', label: 'WMA 20', keys: ['wma20'], color: '#f472b6' },
  { id: 'vwap', label: 'Session VWAP', keys: ['vwap'], color: '#0ea5e9', intradayOnly: true },
  { id: 'bb', label: 'Bollinger Bands', keys: ['bbUpper', 'bbLower'], color: '#9aa8b5' },
  { id: 'keltner', label: 'Keltner Channels', keys: ['keltnerUpper', 'keltnerMiddle', 'keltnerLower'], color: '#f59e0b' },
  { id: 'donchian', label: 'Donchian Channels', keys: ['donchianUpper', 'donchianMiddle', 'donchianLower'], color: '#8b5cf6' },
  { id: 'supertrend', label: 'SuperTrend', keys: ['supertrendUp', 'supertrendDown'], color: '#10a779' },
  { id: 'psar', label: 'Parabolic SAR', keys: ['psar'], color: '#64748b' },
  { id: 'pivot', label: 'Classic Pivots', keys: ['pivotP', 'pivotR1', 'pivotS1', 'pivotR2', 'pivotS2'], color: '#94a3b8' }
];
