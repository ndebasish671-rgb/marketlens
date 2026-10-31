import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import { formatPrice } from '../../shared/catalog.js';
import { PRICE_OVERLAYS, SUB_STUDIES } from '../../shared/studies.js';

const COLORS = { up: '#10a779', down: '#ef6b73', sma20: '#e3a23c', sma50: '#6b8afd', ema20: '#a78bfa', bb: '#9aa8b5', vwap: '#0ea5e9' };
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function tzFormatter(timezone, withTime) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) });
}
function tickFormatter(time, tickMarkType, timezone) {
  const d = new Date(Number(time) * 1000);
  if (tickMarkType >= 3) return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  if (tickMarkType === 0) return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric' }).format(d);
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: 'short' }).format(d);
}
function baseOptions(height, timezone, currency, showTime) {
  return {
    height,
    layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#8499b0', fontFamily: FONT, fontSize: 11, attributionLogo: true },
    grid: { vertLines: { color: '#f2f5f7' }, horzLines: { color: '#eef2f5' } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#b7c3cd', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#334155' }, horzLine: { color: '#b7c3cd', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#334155' } },
    rightPriceScale: { borderVisible: false, minimumWidth: 70, scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderVisible: false, visible: showTime, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 7, minBarSpacing: 2, fixLeftEdge: true, tickMarkFormatter: (t, type) => tickFormatter(t, type, timezone) },
    localization: { locale: 'en-US', timeFormatter: t => tzFormatter(timezone, true).format(new Date(Number(t) * 1000)), priceFormatter: p => formatPrice(p, currency) },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
  };
}
function lineData(series, key) { return series.filter(s => Number.isFinite(s[key])).map(s => ({ time: s.time, value: s[key] })); }
function overlayStyle(key, color) {
  if (key === 'supertrendUp') return { color: COLORS.up, lineWidth: 1.6 };
  if (key === 'supertrendDown') return { color: COLORS.down, lineWidth: 1.6 };
  if (key === 'psar') return { color, lineWidth: 1, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 };
  const dashed = /Upper|Lower|Middle|pivot|bb/.test(key);
  return { color, lineWidth: key.endsWith('Middle') || key === 'vwap' ? 1.2 : 1.4, lineStyle: dashed || key === 'vwap' ? LineStyle.Dashed : LineStyle.Solid };
}

export default function PriceChart({ candles = [], series = [], type = 'candles', show = {}, levels = null, extraLevels = [], timezone = 'UTC', currency = 'USD', height = 300, resetKey = '' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const mainRef = useRef(null);
  const volumeRef = useRef(null);
  const overlaysRef = useRef({});
  const levelLinesRef = useRef([]);
  const extraLinesRef = useRef([]);
  const fittedRef = useRef('');
  const showKey = JSON.stringify(show);
  const levelsKey = levels ? `${levels.buyTrigger}-${levels.sellTrigger}-${levels.status}-${levels.stale}` : '';
  const extraKey = JSON.stringify(extraLevels);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, { ...baseOptions(height, timezone, currency, false), width: el.clientWidth });
    chartRef.current = chart;
    if (type === 'candles') {
      mainRef.current = chart.addSeries(CandlestickSeries, { upColor: COLORS.up, downColor: COLORS.down, borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down, priceLineColor: '#94a3b8', priceLineStyle: LineStyle.Dashed });
    } else {
      mainRef.current = chart.addSeries(LineSeries, { color: COLORS.up, lineWidth: 2, crosshairMarkerRadius: 4, priceLineColor: COLORS.up, priceLineStyle: LineStyle.Dashed });
    }
    volumeRef.current = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    const overlays = {};
    for (const overlay of PRICE_OVERLAYS) {
      if (!show[overlay.id]) continue;
      for (const key of overlay.keys) {
        overlays[key] = chart.addSeries(LineSeries, { ...overlayStyle(key, overlay.color), priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      }
    }
    overlaysRef.current = overlays;
    fittedRef.current = '';
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) chart.applyOptions({ width: w }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; mainRef.current = null; volumeRef.current = null; overlaysRef.current = {}; levelLinesRef.current = []; extraLinesRef.current = []; };
  }, [type, showKey, timezone, currency, height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainRef.current) return;
    if (type === 'candles') mainRef.current.setData(candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    else mainRef.current.setData(candles.map(c => ({ time: c.time, value: c.close })));
    volumeRef.current?.setData(candles.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(16,167,121,0.28)' : 'rgba(239,107,115,0.28)' })));
    for (const [key, s] of Object.entries(overlaysRef.current)) s.setData(lineData(series, key));
    if (fittedRef.current !== resetKey && candles.length) { chart.timeScale().fitContent(); fittedRef.current = resetKey; }
  }, [candles, series, type, showKey, resetKey]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    for (const line of levelLinesRef.current) { try { main.removePriceLine(line); } catch {} }
    levelLinesRef.current = [];
    if (!levels || levels.status === 'unavailable') return;
    const add = (price, color, title) => {
      if (!Number.isFinite(price)) return;
      levelLinesRef.current.push(main.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }));
    };
    add(levels.buyTrigger, COLORS.up, 'Buy trigger');
    add(levels.sellTrigger, COLORS.down, 'Sell/exit trigger');
  }, [levelsKey, type, showKey]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    for (const line of extraLinesRef.current) { try { main.removePriceLine(line); } catch {} }
    extraLinesRef.current = [];
    for (const level of extraLevels || []) {
      if (!Number.isFinite(level.price)) continue;
      extraLinesRef.current.push(main.createPriceLine({ price: level.price, color: level.color || '#c084fc', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: level.title || '' }));
    }
  }, [extraKey, type, showKey]);

  return <div ref={containerRef} className="price-chart" style={{ height }} role="img" aria-label="Interactive price chart with volume and optional indicator overlays or buy/sell trigger levels. Drag to pan, scroll to zoom." />;
}

function studyValueFormatter(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export function StudyChart({ series = [], study, timezone = 'UTC', height = 180, resetKey = '' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const linesRef = useRef([]);
  const histRef = useRef(null);
  const fittedRef = useRef('');
  const studyId = study?.id;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !study) return;
    const opts = baseOptions(height, timezone, 'USD', true);
    opts.layout.attributionLogo = false;
    opts.rightPriceScale.scaleMargins = { top: 0.14, bottom: 0.14 };
    opts.localization.priceFormatter = studyValueFormatter;
    opts.grid.vertLines.visible = false;
    const chart = createChart(el, { ...opts, width: el.clientWidth });
    chartRef.current = chart;
    linesRef.current = [];
    histRef.current = null;
    if (study.histogram) {
      histRef.current = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    }
    for (const line of study.lines || []) {
      const s = chart.addSeries(LineSeries, { color: line.color, lineWidth: 1.6, priceLineVisible: false, lastValueVisible: true, ...(study.min != null && study.max != null ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: study.min, maxValue: study.max } }) } : {}) });
      linesRef.current.push({ key: line.key, series: s });
    }
    const anchor = linesRef.current[0]?.series || histRef.current;
    for (const ref of study.references || []) {
      anchor?.createPriceLine({ price: ref, color: ref === 0 ? '#94a3b8' : '#cbd5e1', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    }
    fittedRef.current = '';
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) chart.applyOptions({ width: w }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; linesRef.current = []; histRef.current = null; };
  }, [studyId, timezone, height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !study) return;
    for (const { key, series: s } of linesRef.current) s.setData(lineData(series, key));
    if (histRef.current && study.histogram) {
      const key = study.histogram.key;
      let prev = null;
      histRef.current.setData(series.filter(s => Number.isFinite(s[key])).map(s => {
        const value = s[key];
        const rising = prev == null || value >= prev;
        prev = value;
        const positive = study.id === 'awesome' ? rising : value >= 0;
        return { time: s.time, value, color: positive ? 'rgba(16,167,121,0.55)' : 'rgba(239,107,115,0.55)' };
      }));
    }
    if (fittedRef.current !== resetKey && series.length) { chart.timeScale().fitContent(); fittedRef.current = resetKey; }
  }, [series, studyId, resetKey]);

  return <div ref={containerRef} className="study-chart" style={{ height }} role="img" aria-label={`${study?.name || 'Indicator'} chart`} />;
}

export function OscillatorChart({ series = [], kind = 'rsi', timezone = 'UTC', height = 108, resetKey = '' }) {
  const study = SUB_STUDIES.find(s => s.id === (kind === 'macd' ? 'macd' : 'rsi'));
  return <StudyChart series={series} study={study} timezone={timezone} height={height} resetKey={resetKey} />;
}

export const INDICATOR_COLORS = COLORS;
