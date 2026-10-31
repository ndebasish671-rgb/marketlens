import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LayoutDashboard, BarChart3, Star, Newspaper, Search, RefreshCw, Pause, Play,
  Globe, ChevronRight, Plus, Clock3, CalendarDays, Info, ShieldCheck, Database,
  Menu, X, SlidersHorizontal, TrendingUp, Activity, AlertCircle, Loader2,
  CandlestickChart, LineChart, ArrowUpRight, BookOpen, KeyRound
} from 'lucide-react';
import { STOCKS, INDICES, DEFAULT_WATCHLIST, MARKET_SYMBOLS, catalogEntry, formatPrice, formatChange, formatNumber, formatCompact } from '../shared/catalog.js';
import { analyze } from '../shared/indicators.js';
import PriceChart, { OscillatorChart, INDICATOR_COLORS } from './components/PriceChart.jsx';
import Sparkline from './components/Sparkline.jsx';
import StockLogo from './components/StockLogo.jsx';
import SignalCard, { VerdictBadge, SignalDisclaimer } from './components/SignalCard.jsx';
import StockTable from './components/StockTable.jsx';
import NewsList from './components/NewsList.jsx';
import SearchDialog from './components/SearchDialog.jsx';
import { MethodologyModal, SourcesModal, SignalDetailModal } from './components/InfoModals.jsx';
import ProviderConnection from './components/ProviderConnection.jsx';
import { apiConfig, apiRequest, getJSON } from './lib/api.js';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'screener', label: 'Market screener', icon: BarChart3 },
  { id: 'watchlist', label: 'My watchlist', icon: Star },
  { id: 'news', label: 'Market news', icon: Newspaper }
];
const RANGES = { intraday: ['1D', '5D'], swing: ['1M', '3M', '1Y'] };

function load(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
function dayKey(ts, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000)); }
  catch { return new Date(ts * 1000).toISOString().slice(0, 10); }
}
function asOf(ts, tz) {
  if (!ts) return 'Timestamp unavailable';
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(new Date(ts * 1000)); }
  catch { return new Date(ts * 1000).toUTCString(); }
}
function sessionOpen(quote) {
  const p = quote?.regularPeriod;
  if (!p?.start || !p?.end) return null;
  const now = Date.now() / 1000;
  return now >= p.start && now < p.end;
}
function Logo() {
  return <span className="brand-logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="22" height="22"><path d="M6 24V17M13 24V11M20 24V14M27 24V6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg></span>;
}
function MarketCard({ item, unavailable = false }) {
  if (!item && unavailable) return <div className="market-card market-card-empty"><BarChart3 size={20} /><span>Awaiting API connection</span></div>;
  if (!item) return <div className="market-card skeleton-card"><span className="skeleton line short" /><span className="skeleton line" /></div>;
  const up = (item.changePercent ?? 0) >= 0;
  const open = sessionOpen(item);
  return (
    <div className="market-card">
      <div className="market-card-top"><span className="market-card-name">{item.name}</span><span className={`market-tag market-${item.market}`}>{item.market === 'IN' ? 'India' : 'US'}</span></div>
      <div className="market-card-value">{formatPrice(item.price, item.currency)}</div>
      <div className="market-card-bottom">
        <span className={`market-change ${up ? 'pos' : 'neg'}`}>{up ? <ArrowUpRight size={14} /> : <TrendingUp size={14} className="flip" />}{formatChange(item.changePercent)}</span>
        <Sparkline values={(item.candles || []).slice(-10).map(c => c.close)} width={92} height={34} color={up ? '#10a779' : '#ef6b73'} />
      </div>
      <div className="market-card-status"><span className={`tiny-dot ${open ? 'open' : 'closed'}`} />{open == null ? 'Latest session' : open ? 'Regular session open' : 'Market closed'}{item.stale ? ' · cached' : ''}</div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [symbol, setSymbol] = useState(() => load('ml-symbol', 'AAPL'));
  const [watchlist, setWatchlist] = useState(() => { const w = load('ml-watchlist', DEFAULT_WATCHLIST); return Array.isArray(w) ? w.slice(0, 12) : DEFAULT_WATCHLIST; });
  const [mode, setMode] = useState('intraday');
  const [range, setRange] = useState('1D');
  const [chartType, setChartType] = useState('candles');
  const [show, setShow] = useState({ sma20: true, sma50: true, ema20: false, bb: false, vwap: false });
  const [osc, setOsc] = useState('rsi');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [analysisState, setAnalysisState] = useState({ data: null, loading: apiConfig.configured, error: null });
  const [marketState, setMarketState] = useState({ items: [], errors: [], loading: apiConfig.configured, error: null });
  const [watchState, setWatchState] = useState({ items: [], loading: apiConfig.configured, error: null });
  const [newsState, setNewsState] = useState({ items: [], loading: apiConfig.configured, error: null });
  const [newsTopic, setNewsTopic] = useState('global');
  const [marketFilter, setMarketFilter] = useState('ALL');
  const [screenerQuery, setScreenerQuery] = useState('');
  const [signalFilter, setSignalFilter] = useState('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [providerStatus, setProviderStatus] = useState(null);
  const [providerTesting, setProviderTesting] = useState(false);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const notify = useCallback((message, type = 'ok') => setToast({ message, type, id: Date.now() }), []);

  const loadProviderStatus = useCallback(async () => {
    if (!apiConfig.configured) { setProviderStatus({ state: 'api_unconfigured', configured: false, enabled: false }); return; }
    try { setProviderStatus(await getJSON('/api/provider/status')); }
    catch { setProviderStatus({ state: 'error', configured: false, enabled: false }); }
  }, []);
  useEffect(() => { loadProviderStatus(); }, [loadProviderStatus]);
  useEffect(() => { if (modal?.type === 'connection') loadProviderStatus(); }, [modal?.type, loadProviderStatus]);
  const testProvider = useCallback(async () => {
    if (!apiConfig.configured) { notify('Configure the backend API URL before testing a provider.', 'warn'); return; }
    setProviderTesting(true);
    try {
      const j = await apiRequest('/api/provider/test', { method: 'POST' });
      if (j.status) setProviderStatus(j.status);
      notify(j.ok ? 'Finnhub connection successful.' : (j.error || 'Provider test failed; fallback remains active.'), j.ok ? 'ok' : 'warn');
    } catch (e) { notify(e.message || 'Could not test the provider. Check the server and try again.', 'warn'); }
    finally { setProviderTesting(false); }
  }, [notify]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => save('ml-watchlist', watchlist), [watchlist]);
  useEffect(() => save('ml-symbol', symbol), [symbol]);

  useEffect(() => {
    if (!autoRefresh || !apiConfig.configured) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, refresh]);
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!apiConfig.configured) return;
    const ctrl = new AbortController();
    setAnalysisState(s => ({ ...s, loading: apiConfig.configured, error: null }));
    getJSON(`/api/analysis?symbol=${encodeURIComponent(symbol)}`, ctrl.signal)
      .then(data => { setAnalysisState({ data, loading: false, error: null }); setLastSync(new Date()); })
      .catch(e => { if (e.name !== 'AbortError') setAnalysisState(s => ({ ...s, loading: false, error: e.message })); });
    return () => ctrl.abort();
  }, [symbol, refreshKey]);

  useEffect(() => {
    if (!apiConfig.configured) return;
    const ctrl = new AbortController();
    setMarketState(s => ({ ...s, loading: apiConfig.configured, error: null }));
    getJSON('/api/market', ctrl.signal)
      .then(data => setMarketState({ items: data.items || [], errors: data.errors || [], loading: false, error: null }))
      .catch(e => { if (e.name !== 'AbortError') setMarketState(s => ({ ...s, loading: false, error: e.message })); });
    return () => ctrl.abort();
  }, [refreshKey]);

  const watchKey = watchlist.join(',');
  useEffect(() => {
    if (!apiConfig.configured) return;
    const ctrl = new AbortController();
    if (!watchlist.length) { setWatchState({ items: [], loading: false, error: null }); return; }
    setWatchState(s => ({ ...s, loading: apiConfig.configured, error: null }));
    getJSON(`/api/market?symbols=${encodeURIComponent(watchKey)}`, ctrl.signal)
      .then(data => setWatchState({ items: data.items || [], loading: false, error: data.errors?.length ? 'Some symbols could not be loaded.' : null }))
      .catch(e => { if (e.name !== 'AbortError') setWatchState(s => ({ ...s, loading: false, error: e.message })); });
    return () => ctrl.abort();
  }, [watchKey, refreshKey]);

  useEffect(() => {
    if (!apiConfig.configured) return;
    const ctrl = new AbortController();
    setNewsState(s => ({ ...s, loading: apiConfig.configured, error: null }));
    const url = page === 'news' && newsTopic !== 'stock' ? `/api/news?topic=${newsTopic}` : `/api/news?symbol=${encodeURIComponent(symbol)}`;
    getJSON(url, ctrl.signal)
      .then(data => setNewsState({ items: data.items || [], loading: false, error: null }))
      .catch(e => { if (e.name !== 'AbortError') setNewsState(s => ({ ...s, loading: false, error: e.message })); });
    return () => ctrl.abort();
  }, [page, newsTopic, symbol, refreshKey]);

  const a = analysisState.data?.symbol === symbol ? analysisState.data : null;
  const quote = a?.quote;
  const tz = quote?.timezone || 'UTC';
  const currency = quote?.currency || (symbol.endsWith('.NS') || symbol.endsWith('.BO') ? 'INR' : 'USD');
  const entry = catalogEntry(symbol);
  const stockName = entry?.name || quote?.name || symbol;
  const intradaySignal = useMemo(() => a?.intraday?.candles ? analyze(a.intraday.candles, { mode: 'intraday', timeZone: tz }) : null, [a, tz]);
  const swingSignal = useMemo(() => a?.daily?.candles ? analyze(a.daily.candles, { mode: 'swing', timeZone: tz }) : null, [a, tz]);
  const activeSignal = mode === 'intraday' ? intradaySignal : swingSignal;
  const chartData = useMemo(() => {
    if (!a) return { candles: [], series: [] };
    const src = mode === 'intraday' ? a.intraday : a.daily;
    let candles = src?.candles || [];
    if (mode === 'intraday' && range === '1D' && candles.length) {
      const key = dayKey(candles.at(-1).time, tz);
      candles = candles.filter(c => dayKey(c.time, tz) === key);
    }
    if (mode === 'swing' && candles.length) {
      const days = { '1M': 31, '3M': 92, '1Y': 366 }[range] || 92;
      const cutoff = candles.at(-1).time - days * 86400;
      candles = candles.filter(c => c.time >= cutoff);
    }
    const times = new Set(candles.map(c => c.time));
    const series = (activeSignal?.series || []).filter(s => times.has(s.time));
    return { candles, series };
  }, [a, mode, range, tz, activeSignal]);

  const indices = INDICES.map(ix => marketState.items.find(i => i.symbol === ix.symbol));
  const featured = marketState.items.filter(i => STOCKS.some(s => s.symbol === i.symbol));
  const watchItems = watchlist.map(s => watchState.items.find(i => i.symbol === s) || marketState.items.find(i => i.symbol === s)).filter(Boolean);
  const stale = Boolean(a?.daily?.stale || a?.intraday?.stale || marketState.items.some(i => i.stale) || watchItems.some(i => i.stale));
  const open = sessionOpen(quote);
  const chartShow = { ...show, vwap: mode === 'intraday' && show.vwap };
  const resetKey = `${symbol}-${mode}-${range}-${chartType}`;

  const selectSymbol = useCallback(sym => { setSymbol(sym); setPage('overview'); setSearchOpen(false); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const toggleWatch = useCallback(sym => {
    setWatchlist(w => {
      if (w.includes(sym)) { notify(`${sym} removed from watchlist`); return w.filter(x => x !== sym); }
      if (w.length >= 12) { notify('Watchlist is full (12 stocks). Remove one to add another.', 'warn'); return w; }
      notify(`${sym} added to watchlist`); return [...w, sym];
    });
  }, [notify]);
  const switchMode = m => { setMode(m); setRange(m === 'intraday' ? '1D' : '3M'); };
  const navigate = id => { setPage(id); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const screenerItems = useMemo(() => featured.filter(s => {
    if (marketFilter !== 'ALL' && s.market !== marketFilter) return false;
    if (signalFilter !== 'All' && s.swing?.verdict !== signalFilter) return false;
    const q = screenerQuery.trim().toLowerCase();
    if (q && !s.name.toLowerCase().includes(q) && !s.symbol.toLowerCase().includes(q)) return false;
    return true;
  }), [featured, marketFilter, signalFilter, screenerQuery]);

  const pageTitle = { overview: 'Market overview', screener: 'Market screener', watchlist: 'My watchlist', news: 'Market news' }[page];
  const pageSub = { overview: 'Less noise. More perspective on the stocks you follow.', screener: 'A starting point for your next deep dive — Indian and US equities.', watchlist: 'Your personal shortlist, with prices and swing context in one place.', news: 'Headlines that move markets, sourced from Google News.' }[page];
  const indiaQuote = marketState.items.find(i => i.symbol === '^NSEI');
  const usQuote = marketState.items.find(i => i.symbol === '^GSPC');
  const indiaOpen = sessionOpen(indiaQuote);
  const usOpen = sessionOpen(usQuote);
  const ind = activeSignal?.indicators || {};
  const saved = watchlist.includes(symbol);

  return (
    <div className="app-shell">
      {mobileNav && <div className="nav-backdrop" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')} aria-label="MarketLens home"><Logo /><span>marketlens</span></button>
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {PAGES.map(p => <button key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => navigate(p.id)}><p.icon size={18} /><span>{p.label}</span>{p.id === 'watchlist' && <span className="nav-count">{watchlist.length}</span>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="coverage-card">
          <Globe size={19} />
          <strong>Two markets.<br />One perspective.</strong>
          <p>NSE + BSE · NYSE + Nasdaq</p>
          <div className="coverage-tags"><span>India</span><span>United States</span></div>
        </div>
        <div className="sidebar-links">
          <button onClick={() => setModal({ type: 'method' })}><BookOpen size={16} />How signals work</button>
          <button onClick={() => setModal({ type: 'sources' })}><Database size={16} />Data & sources</button>
          <button onClick={() => setModal({ type: 'connection' })}><KeyRound size={16} />API connection{providerStatus?.enabled && <span className="tiny-dot open" />}</button>
        </div>
        <div className="sidebar-foot">Independent by design.<br /><span>Research, not recommendations.</span></div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Toggle navigation"><Menu size={21} /></button>
          <button className="search-box top-search" onClick={() => setSearchOpen(true)} aria-label="Search stocks"><Search size={17} /><span>Search stocks, tickers, companies…</span><kbd>⌘ K</kbd></button>
          <div className="topbar-right">
            <span className={`sync-status ${stale ? 'stale' : ''}`}><span className="tiny-dot" />{!apiConfig.configured ? 'API not configured' : stale ? 'Cached data' : autoRefresh ? 'Auto-refresh · 60s' : 'Auto-refresh paused'}</span>
            <button className="icon-btn" onClick={() => setAutoRefresh(v => !v)} aria-label={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'} title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}>{autoRefresh ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="icon-btn" onClick={refresh} disabled={!apiConfig.configured} aria-label="Refresh data" title="Refresh data"><RefreshCw size={16} className={analysisState.loading || marketState.loading ? 'spin' : ''} /></button>
            <span className="topbar-divider" />
            <span className="market-coverage"><Globe size={15} />India + US</span>
          </div>
        </header>

        <main className="content">
          <div className="page-head">
            <div><div className="eyebrow">Your market workspace</div><h1>{pageTitle}</h1><p>{pageSub}</p></div>
            <div className="page-head-right">
              <div className="session-pills"><span><i className={`tiny-dot ${indiaOpen ? 'open' : 'closed'}`} />India {indiaOpen == null ? '—' : indiaOpen ? 'open' : 'closed'}</span><span><i className={`tiny-dot ${usOpen ? 'open' : 'closed'}`} />US {usOpen == null ? '—' : usOpen ? 'open' : 'closed'}</span></div>
              <button className="date-chip" onClick={() => setModal({ type: 'sources' })}><Clock3 size={14} />{!apiConfig.configured ? 'Setup required' : lastSync ? `Updated ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting…'}</button>
            </div>
          </div>

          {!apiConfig.configured && <section className="api-setup-banner" role="status">
            <div className="api-setup-icon"><Database size={24} /></div>
            <div><h2>Connect your MarketLens API</h2><p>{apiConfig.error}</p><p>GitHub Pages hosts the interface only. Deploy the Node backend separately, then set its public URL in <code>API_BASE_URL</code>. Never put a provider key in GitHub Pages.</p><button className="btn btn-primary small" onClick={() => setModal({ type: 'connection' })}><KeyRound size={14} />View setup steps</button></div>
          </section>}
          {stale && <div className="banner banner-warn"><AlertCircle size={16} />Some data is cached while the provider is unavailable. Check timestamps before relying on it.</div>}
          {a?.warnings?.length > 0 && <div className="banner banner-warn"><AlertCircle size={16} />{a.warnings.join(' ')}</div>}
          {a?.providerWarning && <div className="banner banner-warn"><KeyRound size={16} />{a.providerWarning}</div>}

          {page === 'overview' && <>
            <section className="section">
              <div className="section-head"><h2>Market pulse</h2><span className="section-note">Latest available session · may be delayed</span></div>
              <div className="market-grid">{indices.map((item, i) => <MarketCard key={INDICES[i].symbol} item={item} unavailable={!apiConfig.configured} />)}</div>
              {marketState.error && <div className="inline-warning">Index data unavailable. <button onClick={refresh}>Retry</button></div>}
            </section>

            <section className="analysis-grid">
              <div className="card chart-card">
                <div className="chart-head">
                  <div className="stock-identity">
                    <StockLogo symbol={symbol} size={44} />
                    <div><div className="stock-title-row"><h2>{stockName}</h2><button className={`icon-btn tiny star-btn ${saved ? 'starred' : ''}`} onClick={() => toggleWatch(symbol)} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}><Star size={17} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="stock-meta">{symbol} <span>·</span> {quote?.exchange || entry?.exchange || '—'} <span>·</span> {currency} <span className="source-pill">{quote?.source || 'Yahoo Finance'}</span></div></div>
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
                  <div className="range-group">{RANGES[mode].map(r => <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>)}</div>
                  <div className="chart-type-group">
                    <button className={`icon-btn tiny ${chartType === 'candles' ? 'selected' : ''}`} onClick={() => setChartType('candles')} aria-label="Candlestick chart" title="Candlesticks"><CandlestickChart size={17} /></button>
                    <button className={`icon-btn tiny ${chartType === 'line' ? 'selected' : ''}`} onClick={() => setChartType('line')} aria-label="Line chart" title="Line"><LineChart size={17} /></button>
                  </div>
                </div>

                <div className="indicator-bar">
                  <span className="indicator-label">Overlays</span>
                  {[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['ema20', 'EMA 20'], ['bb', 'Bollinger'], ...(mode === 'intraday' ? [['vwap', 'VWAP']] : [])].map(([key, label]) => <button key={key} className={`indicator-chip ${show[key] ? 'on' : ''}`} onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))} aria-pressed={Boolean(show[key])}><i style={{ background: key === 'bb' ? INDICATOR_COLORS.bb : INDICATOR_COLORS[key] }} />{label}</button>)}
                </div>

                <div className="chart-body">
                  {!apiConfig.configured ? <div className="chart-empty"><Database size={26} /><strong>Your charts will appear here</strong><span>Connect the backend API to load real market data. No sample prices are shown.</span><button className="btn btn-ghost" onClick={() => setModal({ type: 'connection' })}>API setup</button></div>
                    : analysisState.error && !a ? <div className="chart-empty"><AlertCircle size={26} /><strong>Chart data unavailable</strong><span>{analysisState.error}</span><button className="btn btn-ghost" onClick={refresh}><RefreshCw size={14} />Retry</button></div>
                    : !a || !chartData.candles.length ? <div className="chart-empty">{analysisState.loading ? <><Loader2 size={24} className="spin" /><span>Loading candles from Yahoo Finance…</span></> : <><BarChart3 size={26} /><span>No {mode} candles available for this symbol.</span></>}</div>
                    : <PriceChart candles={chartData.candles} series={chartData.series} type={chartType} show={chartShow} timezone={tz} currency={currency} height={292} resetKey={resetKey} />}
                </div>

                <div className="oscillator-head">
                  <div className="mini-tabs"><button className={osc === 'rsi' ? 'active' : ''} onClick={() => setOsc('rsi')}>RSI (14)</button><button className={osc === 'macd' ? 'active' : ''} onClick={() => setOsc('macd')}>MACD (12,26,9)</button></div>
                  <span className="osc-value">{osc === 'rsi' ? `RSI ${formatNumber(ind.rsi, 1)}` : `MACD ${formatNumber(ind.macd, 3)} · Signal ${formatNumber(ind.macdSignal, 3)}`}</span>
                </div>
                {chartData.series.length > 0 && <OscillatorChart series={chartData.series} kind={osc} timezone={tz} height={104} resetKey={`${resetKey}-${osc}`} />}

                <div className="tech-strip">
                  <div><span>Trend</span><strong className={ind.price > ind.sma20 ? 'pos' : 'neg'}>{ind.price == null ? '—' : ind.price > ind.sma20 ? 'Above SMA 20' : 'Below SMA 20'}</strong></div>
                  <div><span>Volume</span><strong>{ind.volumeRatio == null ? '—' : `${formatNumber(ind.volumeRatio, 2)}× avg`}</strong></div>
                  <div><span>ATR (14)</span><strong>{formatNumber(ind.atrPercent, 2)}%</strong></div>
                  <div><span>Day range</span><strong>{quote?.dayLow != null ? `${formatNumber(quote.dayLow, 2)} – ${formatNumber(quote.dayHigh, 2)}` : '—'}</strong></div>
                </div>

                <div className="chart-footer">
                  <span><span className={`tiny-dot ${open ? 'open' : 'closed'}`} />{open == null ? 'Session status unknown' : open ? 'Regular session open' : 'Market closed'} · {mode === 'intraday' ? '5-minute bars' : 'Daily bars'}</span>
                  <span>Quote: {quote?.source || 'Yahoo Finance'} · candles/signals: Yahoo Finance · {asOf(quote?.marketTime, tz)}</span>
                </div>
                <div className="chart-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charting by TradingView</a><span>·</span><button onClick={() => setModal({ type: 'sources' })}>Yahoo Finance data</button></div>
              </div>

              <aside className="card signal-desk">
                <div className="signal-desk-head"><div><h2>Signal desk</h2><span>Rule-based · not a forecast</span></div><button className="icon-btn tiny" onClick={() => setModal({ type: 'method' })} aria-label="How signals work"><Info size={16} /></button></div>
                <SignalCard unavailable={!apiConfig.configured} analysis={intradaySignal} active={mode === 'intraday'} onSelect={() => switchMode('intraday')} onDetails={() => setModal({ type: 'signal', mode: 'intraday' })} />
                <SignalCard unavailable={!apiConfig.configured} analysis={swingSignal} active={mode === 'swing'} onSelect={() => switchMode('swing')} onDetails={() => setModal({ type: 'signal', mode: 'swing' })} />
                <SignalDisclaimer onLearn={() => setModal({ type: 'method' })} />
              </aside>
            </section>

            <section className="bottom-grid">
              <div className="card">
                <div className="card-head"><div><h2>Your watchlist <span className="count-chip">{watchlist.length}</span></h2><p>Prices and swing context at a glance.</p></div><div className="card-head-actions"><button className="btn btn-ghost small" onClick={() => setSearchOpen(true)}><Plus size={14} />Add stock</button><button className="text-btn" onClick={() => navigate('watchlist')}>View all <ChevronRight size={14} /></button></div></div>
                <StockTable items={watchItems.slice(0, 5)} watchlist={watchlist} onToggleWatch={toggleWatch} onSelect={selectSymbol} loading={watchState.loading} unavailable={!apiConfig.configured} error={watchState.error} onRetry={refresh} compact />
              </div>
              <div className="card news-preview">
                <div className="card-head"><div><h2>In the headlines</h2><p>News about <strong>{symbol}</strong></p></div><button className="text-btn" onClick={() => { setNewsTopic('stock'); navigate('news'); }}>All news <ChevronRight size={14} /></button></div>
                <NewsList unavailable={!apiConfig.configured} items={newsState.items} loading={newsState.loading} error={newsState.error} onRetry={refresh} limit={4} />
                <div className="news-source-note">Headlines via Google News RSS · personal, non-commercial use</div>
              </div>
            </section>
          </>}

          {page === 'screener' && <section className="card screener-card">
            <div className="card-head"><div><h2>Featured stocks <span className="count-chip">{featured.length}</span></h2><p>A curated starting universe. Use search above to analyze any NSE, BSE, NYSE or Nasdaq-listed stock.</p></div></div>
            <div className="filter-bar">
              <div className="segmented">{[['ALL', 'All markets'], ['IN', 'India'], ['US', 'US']].map(([id, label]) => <button key={id} className={marketFilter === id ? 'active' : ''} onClick={() => setMarketFilter(id)}>{label}</button>)}</div>
              <div className="search-box filter-search"><Search size={15} /><input value={screenerQuery} onChange={e => setScreenerQuery(e.target.value)} placeholder="Filter by name or ticker" aria-label="Filter screener" /></div>
              <label className="select-wrap"><SlidersHorizontal size={14} /><select value={signalFilter} onChange={e => setSignalFilter(e.target.value)} aria-label="Filter by swing signal"><option>All</option><option>Buy</option><option>Hold</option><option>Sell</option></select></label>
            </div>
            <StockTable items={screenerItems} watchlist={watchlist} onToggleWatch={toggleWatch} onSelect={selectSymbol} loading={marketState.loading} unavailable={!apiConfig.configured} error={marketState.error} onRetry={refresh} sortable emptyTitle="No stocks match these filters" emptyText="Try another market, signal, or search term." />
            <div className="table-footnote">Swing signals use daily bars and the published rules. They are not recommendations. Data: Yahoo Finance, may be delayed.</div>
          </section>}

          {page === 'watchlist' && <section className="card">
            <div className="card-head"><div><h2>Saved stocks <span className="count-chip">{watchlist.length}/12</span></h2><p>Stored in this browser. Click any row to open the full analysis.</p></div><button className="btn btn-primary small" onClick={() => setSearchOpen(true)}><Plus size={15} />Add stock</button></div>
            <StockTable items={watchItems} watchlist={watchlist} onToggleWatch={toggleWatch} onSelect={selectSymbol} loading={watchState.loading} unavailable={!apiConfig.configured} error={watchState.error} onRetry={refresh} sortable emptyTitle="Your watchlist is empty" emptyText="Search for a stock and tap the star to save it here." />
          </section>}

          {page === 'news' && <section className="card news-page-card">
            <div className="card-head"><div><h2>Market headlines</h2><p>Original reporting from publishers, linked via Google News.</p></div><button className="btn btn-ghost small" onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
            <div className="filter-bar"><div className="segmented">{[['global', 'Global'], ['india', 'India'], ['us', 'US'], ['stock', symbol]].map(([id, label]) => <button key={id} className={newsTopic === id ? 'active' : ''} onClick={() => setNewsTopic(id)}>{label}</button>)}</div></div>
            <NewsList unavailable={!apiConfig.configured} items={newsState.items} loading={newsState.loading} error={newsState.error} onRetry={refresh} layout="grid" />
            <div className="table-footnote">Google News RSS is for personal, non-commercial feed-reader use. Public or commercial redistribution requires appropriate rights.</div>
          </section>}

          <footer className="page-footer">
            <div><ShieldCheck size={15} /><span>Built for perspective, not promises. Educational analysis only — not investment advice. Data may be delayed.</span></div>
            <div><button onClick={() => setModal({ type: 'method' })}>Methodology</button><span>·</span><button onClick={() => setModal({ type: 'sources' })}>Data & sources</button></div>
          </footer>
        </main>
      </div>

      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onSelect={selectSymbol} watchlist={watchlist} onToggleWatch={toggleWatch} />}
      {modal?.type === 'method' && <MethodologyModal onClose={() => setModal(null)} />}
      {modal?.type === 'sources' && <SourcesModal onClose={() => setModal(null)} />}
      {modal?.type === 'connection' && <ProviderConnection status={providerStatus} testing={providerTesting} onTest={testProvider} onClose={() => setModal(null)} />}
      {modal?.type === 'signal' && <SignalDetailModal analysis={modal.mode === 'intraday' ? intradaySignal : swingSignal} symbol={symbol} currency={currency} onClose={() => setModal(null)} onMethodology={() => setModal({ type: 'method' })} />}
      {toast && <div className={`toast toast-${toast.type}`} role="status">{toast.type === 'warn' ? <AlertCircle size={16} /> : <ShieldCheck size={16} />}{toast.message}</div>}
    </div>
  );
}
