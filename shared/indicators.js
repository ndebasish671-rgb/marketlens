// Pure, deterministic technical-indicator calculations shared by UI and tests.
// No randomness, no fabricated data, no predictive "AI" scores.

export function cleanCandles(candles = []) {
  const seen = new Set();
  return candles
    .filter(c => c && Number.isFinite(c.time) && [c.open, c.high, c.low, c.close].every(Number.isFinite) && c.close > 0)
    .map(c => ({ ...c, volume: Number.isFinite(c.volume) ? c.volume : 0 }))
    .sort((a, b) => a.time - b.time)
    .filter(c => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    });
}

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    if (window.every(Number.isFinite)) out[i] = window.reduce((a, b) => a + b, 0) / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let seed = 0;
  let count = 0;
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (prev == null) {
      seed += v;
      count++;
      if (count === period) {
        prev = seed / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line = values.map((_, i) => fastE[i] != null && slowE[i] != null ? fastE[i] - slowE[i] : null);
  const start = line.findIndex(v => v != null);
  const compact = start >= 0 ? line.slice(start) : [];
  const sigCompact = ema(compact, signalPeriod);
  const signal = new Array(values.length).fill(null);
  const histogram = new Array(values.length).fill(null);
  if (start >= 0) {
    for (let i = 0; i < compact.length; i++) {
      signal[start + i] = sigCompact[i];
      if (sigCompact[i] != null) histogram[start + i] = compact[i] - sigCompact[i];
    }
  }
  return { line, signal, histogram };
}

export function bollinger(values, period = 20, mult = 2) {
  const middle = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i];
    if (mean == null) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const trs = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

function sessionKey(time, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time * 1000));
  } catch {
    return new Date(time * 1000).toISOString().slice(0, 10);
  }
}

export function sessionVwap(candles, timeZone = 'UTC') {
  const out = new Array(candles.length).fill(null);
  let key = null;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const k = sessionKey(c.time, timeZone);
    if (k !== key) { key = k; pv = 0; vol = 0; }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

function last(arr) { return arr.length ? arr[arr.length - 1] : null; }

export function computeSeries(candles, timeZone) {
  const closes = candles.map(c => c.close);
  const m = macd(closes);
  const bb = bollinger(closes);
  const r = rsi(closes);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const e20 = ema(closes, 20);
  const vwap = sessionVwap(candles, timeZone);
  const atr14 = atr(candles);
  return candles.map((c, i) => ({
    time: c.time,
    sma20: s20[i], sma50: s50[i], ema20: e20[i],
    bbUpper: bb.upper[i], bbLower: bb.lower[i], bbMiddle: bb.middle[i],
    rsi: r[i], macd: m.line[i], macdSignal: m.signal[i], histogram: m.histogram[i],
    vwap: vwap[i], atr: atr14[i]
  }));
}

const RULE_META = {
  trend: { label: 'Trend structure', weight: 1 },
  macd: { label: 'MACD momentum', weight: 1 },
  rsi: { label: 'RSI mean reversion', weight: 1 },
  momentum: { label: 'Price momentum', weight: 1 },
  volume: { label: 'Volume confirmation', weight: 1 },
  vwap: { label: 'VWAP position', weight: 1 }
};

export function analyze(candles, { mode = 'swing', timeZone = 'UTC' } = {}) {
  const data = cleanCandles(candles);
  const minBars = mode === 'swing' ? 60 : 60;
  if (data.length < minBars) {
    return {
      mode, verdict: 'Unavailable', score: null, alignment: null,
      bullish: 0, bearish: 0, neutral: 0, rules: [], indicators: {}, series: [],
      reason: `Needs at least ${minBars} valid bars; received ${data.length}.`,
      barTime: data.length ? last(data).time : null, barCount: data.length
    };
  }
  const series = computeSeries(data, timeZone);
  const i = data.length - 1;
  const c = data[i];
  const s = series[i];
  const closes = data.map(x => x.close);
  const volAvg20 = sma(data.map(x => x.volume), 20)[i];
  const volumeRatio = volAvg20 > 0 ? c.volume / volAvg20 : null;
  const rocPeriod = 5;
  const roc = i >= rocPeriod && closes[i - rocPeriod] > 0 ? (c.close / closes[i - rocPeriod] - 1) * 100 : null;
  const rules = [];
  const add = (id, vote, detail) => rules.push({ id, ...RULE_META[id], vote, detail });

  if (s.sma20 != null && s.sma50 != null) {
    if (c.close > s.sma20 && s.sma20 > s.sma50) add('trend', 1, `Price is above SMA 20 and SMA 20 is above SMA 50 — an aligned uptrend.`);
    else if (c.close < s.sma20 && s.sma20 < s.sma50) add('trend', -1, `Price is below SMA 20 and SMA 20 is below SMA 50 — an aligned downtrend.`);
    else add('trend', 0, 'Price and moving averages are not fully aligned, so the trend is mixed.');
  } else add('trend', 0, 'Not enough history for both moving averages.');

  if (s.macd != null && s.macdSignal != null) {
    const diff = s.macd - s.macdSignal;
    const eps = Math.max(Math.abs(s.macd), Math.abs(s.macdSignal), 1) * 1e-9;
    if (diff > eps) add('macd', 1, 'MACD is above its signal line, indicating positive momentum.');
    else if (diff < -eps) add('macd', -1, 'MACD is below its signal line, indicating negative momentum.');
    else add('macd', 0, 'MACD equals its signal line; momentum is flat.');
  } else add('macd', 0, 'MACD has not warmed up yet.');

  if (s.rsi != null) {
    if (s.rsi < 30) add('rsi', 1, `RSI is ${s.rsi.toFixed(1)} (below 30). This mean-reversion rule treats oversold conditions as a possible bounce setup, not a guaranteed bottom.`);
    else if (s.rsi > 70) add('rsi', -1, `RSI is ${s.rsi.toFixed(1)} (above 70). This mean-reversion rule treats overbought conditions as pullback risk, not a guaranteed top.`);
    else add('rsi', 0, `RSI is ${s.rsi.toFixed(1)} (30–70), outside the oversold/overbought zones.`);
  } else add('rsi', 0, 'RSI has not warmed up yet.');

  const rocThreshold = mode === 'intraday' ? 0.4 : 1;
  if (roc != null) {
    if (roc > rocThreshold) add('momentum', 1, `Price rose ${roc.toFixed(2)}% over the last 5 bars, above the +${rocThreshold}% momentum threshold.`);
    else if (roc < -rocThreshold) add('momentum', -1, `Price fell ${Math.abs(roc).toFixed(2)}% over the last 5 bars, beyond the −${rocThreshold}% momentum threshold.`);
    else add('momentum', 0, `5-bar price change is ${roc.toFixed(2)}%, inside the ±${rocThreshold}% neutral band.`);
  } else add('momentum', 0, 'Not enough bars for the momentum check.');

  if (volumeRatio != null) {
    if (volumeRatio >= 1.5 && c.close > c.open) add('volume', 1, `Volume is ${volumeRatio.toFixed(2)}× its 20-bar average on an up bar — bullish participation.`);
    else if (volumeRatio >= 1.5 && c.close < c.open) add('volume', -1, `Volume is ${volumeRatio.toFixed(2)}× its 20-bar average on a down bar — bearish participation.`);
    else add('volume', 0, `Volume is ${volumeRatio == null ? 'n/a' : volumeRatio.toFixed(2) + '×'} its 20-bar average; no strong volume confirmation.`);
  } else add('volume', 0, 'Volume data is unavailable for this symbol.');

  if (mode === 'intraday') {
    if (s.vwap != null) {
      if (c.close > s.vwap) add('vwap', 1, 'Price is above the session VWAP, suggesting buyers are paying above the average traded price.');
      else if (c.close < s.vwap) add('vwap', -1, 'Price is below the session VWAP, suggesting sellers are accepting prices below the average traded price.');
      else add('vwap', 0, 'Price equals the session VWAP.');
    } else add('vwap', 0, 'Session VWAP is unavailable.');
  }

  const totalWeight = rules.reduce((a, r) => a + r.weight, 0);
  const net = rules.reduce((a, r) => a + r.vote * r.weight, 0);
  const score = Math.round(50 + 50 * (net / totalWeight));
  const verdict = score >= 67 ? 'Buy' : score <= 33 ? 'Sell' : 'Hold';
  const bullish = rules.filter(r => r.vote > 0).length;
  const bearish = rules.filter(r => r.vote < 0).length;
  const neutral = rules.filter(r => r.vote === 0).length;
  const alignment = Math.round(Math.abs(score - 50) * 2);
  const recent = data.slice(-20);
  const indicators = {
    price: c.close, rsi: s.rsi, macd: s.macd, macdSignal: s.macdSignal, histogram: s.histogram,
    sma20: s.sma20, sma50: s.sma50, ema20: s.ema20, bbUpper: s.bbUpper, bbLower: s.bbLower,
    atr: s.atr, atrPercent: s.atr != null ? s.atr / c.close * 100 : null,
    vwap: s.vwap, volume: c.volume, volumeAvg20: volAvg20, volumeRatio, roc,
    support: Math.min(...recent.map(x => x.low)), resistance: Math.max(...recent.map(x => x.high))
  };
  return {
    mode, verdict, score, alignment, bullish, bearish, neutral, rules, indicators, series,
    barTime: c.time, barCount: data.length,
    reason: verdict === 'Hold' ? 'Indicators are mixed or not strong enough to lean either way.' : `${verdict === 'Buy' ? 'Bullish' : 'Bearish'} rules outweigh the others under this transparent heuristic.`
  };
}

export function swingSummary(candles, timeZone) {
  const a = analyze(candles, { mode: 'swing', timeZone });
  return { verdict: a.verdict, score: a.score, rsi: a.indicators.rsi ?? null, barTime: a.barTime };
}
