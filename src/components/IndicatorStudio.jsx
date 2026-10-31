import React, { useMemo, useState } from 'react';
import {
  Activity, AlertCircle, BarChart3, CalendarDays, CandlestickChart, Clock3, Database,
  FlaskConical, Info, Layers, LineChart, Loader2, RefreshCw, Star, TrendingUp, Waves
} from 'lucide-react';
import { formatPrice, formatChange } from '../../shared/catalog.js';
import { PRICE_OVERLAYS, STUDY_GROUPS, SUB_STUDIES, fibonacciLevels } from '../../shared/studies.js';
import PriceChart, { StudyChart } from './PriceChart.jsx';
import StockLogo from './StockLogo.jsx';

const GROUP_ICONS = { Trend: TrendingUp, Momentum: Activity, Volume: BarChart3, Volatility: Waves, Levels: Layers };
const PERCENT_KEYS = new Set(['roc12', 'atrPercent', 'bbWidth', 'returnVol20']);

function fmt(value, key = '') {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  const digits = abs < 1 && abs > 0 ? 3 : 2;
  return `${value.toFixed(digits)}${PERCENT_KEYS.has(key) ? '%' : ''}`;
}
function percentileRank(values, value) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length || !Number.isFinite(value)) return null;
  return clean.filter(v => v <= value).length / clean.length * 100;
}
function trendRead(latest, prev, key) {
  if (!Number.isFinite(latest?.[key]) || !Number.isFinite(prev?.[key])) return null;
  return latest[key] > prev[key] ? 'rising' : latest[key] < prev[key] ? 'falling' : 'flat';
}

export function interpretStudy(id, latest, prev, series) {
  const v = key => latest?.[key];
  const tone = { neutral: 'neutral', bullish: 'pos', bearish: 'neg', caution: 'warn' };
  const make = (text, t = 'neutral') => ({ text, tone: tone[t] || 'neutral' });
  switch (id) {
    case 'rsi': {
      const x = v('rsi'); if (!Number.isFinite(x)) return make('Waiting for enough bars to calculate RSI.');
      if (x >= 70) return make(`RSI ${x.toFixed(1)} is in overbought territory. Momentum is strong, but pullback risk rises; overbought can persist in uptrends.`, 'caution');
      if (x <= 30) return make(`RSI ${x.toFixed(1)} is in oversold territory. Selling pressure is extended; a bounce is possible, but oversold can persist in downtrends.`, 'caution');
      return make(`RSI ${x.toFixed(1)} is neutral. ${x >= 50 ? 'Momentum leans positive.' : 'Momentum leans negative.'}`, x >= 50 ? 'bullish' : 'bearish');
    }
    case 'macd': {
      const m = v('macd'), s = v('macdSignal'); if (!Number.isFinite(m) || !Number.isFinite(s)) return make('Waiting for MACD warm-up.');
      return m >= s ? make('MACD is above its signal line: upward momentum is dominant. Watch for the histogram to shrink as a possible loss of momentum.', 'bullish')
        : make('MACD is below its signal line: downward momentum is dominant. Watch for the histogram to turn less negative as a possible recovery.', 'bearish');
    }
    case 'stochastic': case 'stochRsi': {
      const kKey = id === 'stochastic' ? 'stochK' : 'stochRsiK';
      const dKey = id === 'stochastic' ? 'stochD' : 'stochRsiD';
      const k = v(kKey), d = v(dKey); if (!Number.isFinite(k)) return make('Waiting for oscillator warm-up.');
      const zone = k >= 80 ? 'overbought' : k <= 20 ? 'oversold' : 'neutral';
      const cross = Number.isFinite(d) ? (k >= d ? '%K is above %D, a short-term positive cross.' : '%K is below %D, a short-term negative cross.') : '';
      return make(`${zone === 'neutral' ? 'Oscillator is in the neutral zone.' : `Oscillator is ${zone}.`} ${cross}`, zone === 'neutral' ? (k >= d ? 'bullish' : 'bearish') : 'caution');
    }
    case 'williamsR': {
      const x = v('williamsR'); if (!Number.isFinite(x)) return make('Waiting for Williams %R warm-up.');
      if (x >= -20) return make(`Williams %R ${x.toFixed(1)} is overbought: price is near the top of its recent range.`, 'caution');
      if (x <= -80) return make(`Williams %R ${x.toFixed(1)} is oversold: price is near the bottom of its recent range.`, 'caution');
      return make(`Williams %R ${x.toFixed(1)} is mid-range.`, 'neutral');
    }
    case 'cci': {
      const x = v('cci'); if (!Number.isFinite(x)) return make('Waiting for CCI warm-up.');
      if (x > 100) return make(`CCI ${x.toFixed(0)} is extended above +100: strong upside deviation, but also elevated pullback risk.`, 'caution');
      if (x < -100) return make(`CCI ${x.toFixed(0)} is extended below -100: strong downside deviation, but also elevated bounce risk.`, 'caution');
      return make(`CCI ${x.toFixed(0)} is inside the normal ±100 band.`, x >= 0 ? 'bullish' : 'bearish');
    }
    case 'roc': case 'momentum': case 'awesome': {
      const key = id === 'roc' ? 'roc12' : id === 'momentum' ? 'momentum10' : 'awesomeOscillator';
      const x = v(key); if (!Number.isFinite(x)) return make('Waiting for momentum warm-up.');
      return x >= 0 ? make('Momentum is positive: recent price change favors the upside.', 'bullish') : make('Momentum is negative: recent price change favors the downside.', 'bearish');
    }
    case 'adx': {
      const x = v('adx'), p = v('plusDI'), m = v('minusDI'); if (!Number.isFinite(x)) return make('Waiting for ADX warm-up.');
      const strength = x >= 25 ? 'strong' : x >= 20 ? 'developing' : 'weak/range-bound';
      const direction = Number.isFinite(p) && Number.isFinite(m) ? (p >= m ? '+DI is above -DI, so directional pressure favors buyers.' : '-DI is above +DI, so directional pressure favors sellers.') : '';
      return make(`ADX ${x.toFixed(1)} suggests a ${strength} trend. ${direction}`, x >= 25 ? (p >= m ? 'bullish' : 'bearish') : 'neutral');
    }
    case 'mfi': {
      const x = v('mfi'); if (!Number.isFinite(x)) return make('Waiting for volume-weighted money flow warm-up.');
      if (x >= 80) return make(`MFI ${x.toFixed(1)} is overbought on a volume-weighted basis.`, 'caution');
      if (x <= 20) return make(`MFI ${x.toFixed(1)} is oversold on a volume-weighted basis.`, 'caution');
      return make(`MFI ${x.toFixed(1)} is neutral.`, x >= 50 ? 'bullish' : 'bearish');
    }
    case 'obv': case 'ad': {
      const key = id === 'obv' ? 'obv' : 'adLine';
      const read = trendRead(latest, prev, key);
      if (!read) return make('Waiting for volume flow data.');
      return read === 'rising' ? make(`${id === 'obv' ? 'OBV' : 'A/D'} is rising: volume flow supports accumulation.`, 'bullish')
        : read === 'falling' ? make(`${id === 'obv' ? 'OBV' : 'A/D'} is falling: volume flow supports distribution.`, 'bearish')
          : make('Volume flow is flat versus the previous bar.', 'neutral');
    }
    case 'cmf': {
      const x = v('cmf'); if (!Number.isFinite(x)) return make('Waiting for Chaikin Money Flow warm-up.');
      return x >= 0 ? make(`CMF ${x.toFixed(3)} is above zero: accumulation pressure dominates.`, 'bullish') : make(`CMF ${x.toFixed(3)} is below zero: distribution pressure dominates.`, 'bearish');
    }
    case 'relativeVolume': {
      const x = v('relativeVolume'); if (!Number.isFinite(x)) return make('Waiting for relative volume warm-up.');
      if (x >= 1.5) return make(`Relative volume ${x.toFixed(2)}× is elevated: participation is well above average.`, 'caution');
      if (x <= 0.7) return make(`Relative volume ${x.toFixed(2)}× is light: moves may have less conviction.`, 'neutral');
      return make(`Relative volume ${x.toFixed(2)}× is near average.`, 'neutral');
    }
    case 'atr': case 'atrPercent': case 'bbWidth': case 'returnVol': {
      const key = id === 'atr' ? 'atr' : id === 'atrPercent' ? 'atrPercent' : id === 'bbWidth' ? 'bbWidth' : 'returnVol20';
      const x = v(key); if (!Number.isFinite(x)) return make('Waiting for volatility warm-up.');
      const rank = percentileRank(series.map(s => s[key]), x);
      const level = rank == null ? '' : rank >= 80 ? 'elevated versus its recent history' : rank <= 20 ? 'subdued versus its recent history' : 'around its recent median';
      return make(`Volatility is ${level}. ${rank != null && rank >= 80 ? 'Wider stops and smaller position sizes are often needed in high-volatility regimes.' : 'Volatility measures risk, not direction.'}`, rank != null && rank >= 80 ? 'caution' : 'neutral');
    }
    case 'percentB': {
      const x = v('percentB'); if (!Number.isFinite(x)) return make('Waiting for Bollinger %B warm-up.');
      if (x > 1) return make('%B is above 1: price is above the upper Bollinger Band.', 'caution');
      if (x < 0) return make('%B is below 0: price is below the lower Bollinger Band.', 'caution');
      return make(`%B ${x.toFixed(2)} places price in the ${x >= 0.5 ? 'upper' : 'lower'} half of the bands.`, x >= 0.5 ? 'bullish' : 'bearish');
    }
    default: return make('Select an indicator to see its latest reading.');
  }
}

function LevelTable({ title, note, rows, currency }) {
  return <div className="level-table-card">
    <div className="level-table-head"><strong>{title}</strong><span>{note}</span></div>
    <table className="level-table"><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td className={row.tone || ''}>{formatPrice(row.price, currency)}</td></tr>)}</tbody></table>
  </div>;
}

export default function IndicatorStudio({
  symbol, stockName, quote, entry, currency = 'USD', timezone = 'UTC', mode, range, ranges,
  switchMode, setRange, chartType, setChartType, candles, series, studySeries, show, setShow,
  activePlan, loading, error, configured, onRetry, onSetup, resetKey, saved, onToggleWatch, open, asOf
}) {
  const [group, setGroup] = useState('Momentum');
  const [studyId, setStudyId] = useState('rsi');
  const groupStudies = useMemo(() => SUB_STUDIES.filter(s => s.group === group), [group]);
  const study = groupStudies.find(s => s.id === studyId) || groupStudies[0] || null;
  const latest = studySeries.at(-1) || {};
  const prev = studySeries.at(-2) || {};
  const fib = useMemo(() => fibonacciLevels(candles, Math.min(candles.length || 0, 120)), [candles]);
  const extraLevels = useMemo(() => {
    if (group !== 'Levels' || !show.fib || !fib) return [];
    return fib.levels.map(l => ({ price: l.price, title: `Fib ${(l.ratio * 100).toFixed(1)}%`, color: l.ratio === 0.618 || l.ratio === 0.382 ? '#c084fc' : '#d8b4fe' }));
  }, [group, show.fib, fib]);
  const reading = study ? interpretStudy(study.id, latest, prev, studySeries) : null;
  const studyKeys = study ? [...(study.lines || []).map(l => l.key), ...(study.histogram ? [study.histogram.key] : [])] : [];
  const hasStudyData = studyKeys.some(key => studySeries.some(s => Number.isFinite(s[key])));
  const pivotRows = [
    ['R3', latest.pivotR3, 'neg'], ['R2', latest.pivotR2, 'neg'], ['R1', latest.pivotR1, 'neg'],
    ['Pivot', latest.pivotP, ''], ['S1', latest.pivotS1, 'pos'], ['S2', latest.pivotS2, 'pos'], ['S3', latest.pivotS3, 'pos']
  ].filter(([, price]) => Number.isFinite(price)).map(([label, price, tone]) => ({ label, price, tone }));
  const donchianRows = [
    ['Upper (20)', latest.donchianUpper, 'neg'], ['Middle', latest.donchianMiddle, ''], ['Lower (20)', latest.donchianLower, 'pos']
  ].filter(([, price]) => Number.isFinite(price)).map(([label, price, tone]) => ({ label, price, tone }));

  const changeGroup = next => {
    setGroup(next);
    const first = SUB_STUDIES.find(s => s.group === next);
    if (first) setStudyId(first.id);
  };

  return <section className="indicator-studio">
    <div className="card chart-card studio-chart-card">
      <div className="chart-head">
        <div className="stock-identity">
          <StockLogo symbol={symbol} size={44} />
          <div>
            <div className="stock-title-row"><h2>{stockName}</h2><button className={`icon-btn tiny star-btn ${saved ? 'starred' : ''}`} onClick={onToggleWatch} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}><Star size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
            <div className="stock-meta">{symbol} <span>·</span> {quote?.exchange || entry?.exchange || '—'} <span>·</span> {currency} <span className="source-pill">{quote?.source || 'Yahoo Finance'}</span></div>
          </div>
        </div>
        <div className="stock-price-block">
          {quote ? <><div className="stock-price">{formatPrice(quote.price, currency)}</div><div className={`stock-change ${(quote.changePercent ?? 0) >= 0 ? 'pos' : 'neg'}`}>{formatChange(quote.changePercent)} <span>vs prev. close</span></div></> : <><span className="skeleton line price-skeleton" /><span className="skeleton line short" /></>}
        </div>
      </div>

      <div className="chart-toolbar">
        <div className="segmented" role="group" aria-label="Chart timeframe">
          <button className={mode === 'intraday' ? 'active' : ''} onClick={() => switchMode('intraday')}><Clock3 size={13} />Intraday</button>
          <button className={mode === 'swing' ? 'active' : ''} onClick={() => switchMode('swing')}><CalendarDays size={13} />Swing</button>
        </div>
        <div className="range-group">{ranges.map(r => <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>)}</div>
        <div className="chart-type-group">
          <button className={`icon-btn tiny ${chartType === 'candles' ? 'selected' : ''}`} onClick={() => setChartType('candles')} aria-label="Candlestick chart" title="Candlesticks"><CandlestickChart size={17} /></button>
          <button className={`icon-btn tiny ${chartType === 'line' ? 'selected' : ''}`} onClick={() => setChartType('line')} aria-label="Line chart" title="Line"><LineChart size={17} /></button>
        </div>
      </div>

      <div className="indicator-bar studio-overlays">
        <span className="indicator-label">Overlays</span>
        {PRICE_OVERLAYS.filter(o => !o.intradayOnly || mode === 'intraday').map(o => <button key={o.id} className={`indicator-chip ${show[o.id] ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, [o.id]: !s[o.id] }))} aria-pressed={Boolean(show[o.id])}><i style={{ background: o.color }} />{o.label}</button>)}
        <button className={`indicator-chip ${show.levels ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, levels: !s.levels }))} aria-pressed={Boolean(show.levels)}><Activity size={12} />Buy/Sell levels</button>
        {group === 'Levels' && <button className={`indicator-chip ${show.fib ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, fib: !s.fib }))} aria-pressed={Boolean(show.fib)}><i style={{ background: '#c084fc' }} />Fibonacci</button>}
      </div>

      <div className="chart-body">
        {!configured ? <div className="chart-empty"><Database size={26} /><strong>Your charts will appear here</strong><span>Connect the backend API to load real market data. No sample prices are shown.</span><button className="btn btn-ghost" onClick={onSetup}>API setup</button></div>
          : error && !candles.length ? <div className="chart-empty"><AlertCircle size={26} /><strong>Chart data unavailable</strong><span>{error}</span><button className="btn btn-ghost" onClick={onRetry}><RefreshCw size={14} />Retry</button></div>
            : !candles.length ? <div className="chart-empty">{loading ? <><Loader2 size={24} className="spin" /><span>Loading candles from Yahoo Finance…</span></> : <><BarChart3 size={26} /><span>No {mode} candles available for this symbol.</span></>}</div>
              : <PriceChart candles={candles} series={studySeries} type={chartType} show={show} levels={show.levels ? activePlan : null} extraLevels={extraLevels} timezone={timezone} currency={currency} height={320} resetKey={resetKey} />}
      </div>

      <div className="chart-footer">
        <span><span className={`tiny-dot ${open ? 'open' : 'closed'}`} />{open == null ? 'Session status unknown' : open ? 'Regular session open' : 'Market closed'} · {mode === 'intraday' ? '5-minute bars' : 'Daily bars'}</span>
        <span>Quote: {quote?.source || 'Yahoo Finance'} · candles/studies: Yahoo Finance · {asOf}</span>
      </div>
    </div>

    <div className="card studio-panel">
      <div className="studio-panel-head">
        <div><h3><FlaskConical size={17} />Indicator studio</h3><p>Essential studies for trend, momentum, volume, volatility and key levels. Informational only — they do not change the Buy/Sell scoring rules.</p></div>
      </div>
      <div className="studio-tabs" role="tablist" aria-label="Indicator categories">
        {STUDY_GROUPS.map(g => { const Icon = GROUP_ICONS[g] || Activity; return <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'active' : ''} onClick={() => changeGroup(g)}><Icon size={14} />{g}</button>; })}
      </div>

      {group !== 'Levels' ? <>
        <div className="study-picker" role="listbox" aria-label={`${group} indicators`}>
          {groupStudies.map(s => <button key={s.id} role="option" aria-selected={study?.id === s.id} className={`study-pill ${study?.id === s.id ? 'active' : ''}`} onClick={() => setStudyId(s.id)}>{s.name}</button>)}
        </div>
        {study && <div className="study-detail">
          <div className="study-detail-head">
            <div><h4>{study.name}</h4><p>{study.description}</p></div>
            <div className="study-values">
              {(study.lines || []).map(l => <span key={l.key} className="study-value"><i style={{ background: l.color }} />{l.label}: <strong>{fmt(latest[l.key], l.key)}</strong></span>)}
              {study.histogram && <span className="study-value"><i style={{ background: '#94a3b8' }} />{study.histogram.label}: <strong>{fmt(latest[study.histogram.key], study.histogram.key)}</strong></span>}
            </div>
          </div>
          {reading && <div className={`study-reading ${reading.tone}`}>{reading.text}</div>}
          {hasStudyData ? <StudyChart series={studySeries} study={study} timezone={timezone} height={210} resetKey={`${resetKey}-${study.id}`} />
            : <div className="study-empty"><AlertCircle size={18} /><span>Not enough completed bars in this range to calculate {study.name}. Try a longer range or swing mode.</span></div>}
        </div>}
      </> : <div className="levels-grid">
        <div className="levels-intro"><h4>Support, resistance and retracement levels</h4><p>Classic pivots use the previous bar’s high/low/close. Donchian channels mark the recent 20-bar range. Fibonacci retracements span the visible swing high to low. These are reference zones, not guaranteed reversal points.</p></div>
        <div className="level-tables">
          {pivotRows.length > 0 && <LevelTable title="Classic pivots" note="Previous bar" rows={pivotRows} currency={currency} />}
          {donchianRows.length > 0 && <LevelTable title="Donchian channel" note="20-bar range" rows={donchianRows} currency={currency} />}
          {fib && <LevelTable title="Fibonacci retracement" note={`${fib.lookback}-bar swing`} rows={fib.levels.map(l => ({ label: `${(l.ratio * 100).toFixed(1)}%`, price: l.price, tone: l.ratio === 0.618 || l.ratio === 0.382 ? 'warn' : '' }))} currency={currency} />}
        </div>
        <div className="levels-actions">
          <button className={`indicator-chip ${show.pivot ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, pivot: !s.pivot }))} aria-pressed={Boolean(show.pivot)}><i style={{ background: '#94a3b8' }} />Plot pivots</button>
          <button className={`indicator-chip ${show.donchian ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, donchian: !s.donchian }))} aria-pressed={Boolean(show.donchian)}><i style={{ background: '#8b5cf6' }} />Plot Donchian</button>
          <button className={`indicator-chip ${show.fib ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, fib: !s.fib }))} aria-pressed={Boolean(show.fib)}><i style={{ background: '#c084fc' }} />Plot Fibonacci</button>
        </div>
      </div>}
      <div className="studio-disclaimer"><Info size={13} />Educational analysis only. Indicators describe past price/volume behavior and can give false signals. They are not financial advice or a recommendation to trade.</div>
    </div>
  </section>;
}
