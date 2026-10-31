import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import { formatPrice } from '../../shared/catalog.js';

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

export default function PriceChart({ candles = [], series = [], type = 'candles', show = {}, timezone = 'UTC', currency = 'USD', height = 300, resetKey = '' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const mainRef = useRef(null);
  const volumeRef = useRef(null);
  const overlaysRef = useRef({});
  const fittedRef = useRef('');
  const showKey = JSON.stringify(show);

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
    const addLine = (key, color, width = 1.4, style = LineStyle.Solid) => {
      overlays[key] = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    };
    if (show.sma20) addLine('sma20', COLORS.sma20);
    if (show.sma50) addLine('sma50', COLORS.sma50);
    if (show.ema20) addLine('ema20', COLORS.ema20);
    if (show.bb) { addLine('bbUpper', COLORS.bb, 1, LineStyle.Dashed); addLine('bbLower', COLORS.bb, 1, LineStyle.Dashed); }
    if (show.vwap) addLine('vwap', COLORS.vwap, 1.5, LineStyle.Dashed);
    overlaysRef.current = overlays;
    fittedRef.current = '';
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) chart.applyOptions({ width: w }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; mainRef.current = null; volumeRef.current = null; overlaysRef.current = {}; };
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

  return <div ref={containerRef} className="price-chart" style={{ height }} role="img" aria-label="Interactive price chart with volume. Drag to pan, scroll to zoom." />;
}

export function OscillatorChart({ series = [], kind = 'rsi', timezone = 'UTC', height = 108, resetKey = '' }) {
  const containerRef = useRef(null);
  const fittedRef = useRef('');
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const opts = baseOptions(height, timezone, 'USD', true);
    opts.layout.attributionLogo = false;
    opts.rightPriceScale.scaleMargins = { top: 0.12, bottom: 0.12 };
    opts.localization.priceFormatter = p => Number(p).toFixed(2);
    opts.grid.vertLines.visible = false;
    const chart = createChart(el, { ...opts, width: el.clientWidth });
    if (kind === 'rsi') {
      const line = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1.6, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      line.setData(lineData(series, 'rsi'));
      line.createPriceLine({ price: 70, color: '#ef6b73', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
      line.createPriceLine({ price: 30, color: '#10a779', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
    } else {
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      hist.setData(series.filter(s => Number.isFinite(s.histogram)).map(s => ({ time: s.time, value: s.histogram, color: s.histogram >= 0 ? 'rgba(16,167,121,0.55)' : 'rgba(239,107,115,0.55)' })));
      const macdLine = chart.addSeries(LineSeries, { color: '#6b8afd', lineWidth: 1.4, priceLineVisible: false, lastValueVisible: false });
      macdLine.setData(lineData(series, 'macd'));
      const signal = chart.addSeries(LineSeries, { color: '#e3a23c', lineWidth: 1.4, priceLineVisible: false, lastValueVisible: false });
      signal.setData(lineData(series, 'macdSignal'));
    }
    if (series.length) chart.timeScale().fitContent();
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) chart.applyOptions({ width: w }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [series, kind, timezone, height, resetKey]);
  return <div ref={containerRef} className="oscillator-chart" style={{ height }} role="img" aria-label={kind === 'rsi' ? 'RSI oscillator chart' : 'MACD indicator chart'} />;
}

export const INDICATOR_COLORS = COLORS;
