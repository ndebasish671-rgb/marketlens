import React, { useEffect, useRef, useState } from 'react';
import { Search, Star, ArrowUpRight, Loader2, X } from 'lucide-react';
import Modal from './Modal.jsx';
import StockLogo from './StockLogo.jsx';
import { STOCKS } from '../../shared/catalog.js';
import { apiConfig, getJSON } from '../lib/api.js';

export default function SearchDialog({ onClose, onSelect, watchlist, onToggleWatch }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(STOCKS.slice(0, 8));
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults(STOCKS.slice(0, 8)); setWarning(apiConfig.configured ? null : 'API not configured. Showing the built-in stock catalogue only.'); setLoading(false); return; }
    if (!apiConfig.configured) {
      const needle = query.toLowerCase();
      setResults(STOCKS.filter(s => s.name.toLowerCase().includes(needle) || s.symbol.toLowerCase().includes(needle)));
      setWarning('API not configured. Showing built-in matches only; connect the backend for live search.');
      setLoading(false); return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const j = await getJSON(`/api/search?q=${encodeURIComponent(query)}`, ctrl.signal);
        setResults(j.items || []);
        setWarning(j.warning || null);
      } catch (e) {
        if (e.name !== 'AbortError') { setWarning(e.message || 'Search is temporarily unavailable. Try again shortly.'); setResults([]); }
      } finally { if (!ctrl.signal.aborted) setLoading(false); }
    }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return (
    <Modal title="Find a stock" subtitle="Search Indian and US markets by company name or ticker." onClose={onClose}>
      <div className="search-box modal-search">
        <Search size={18} />
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Try Reliance, Apple, TCS, NVDA…" aria-label="Search stocks" />
        {loading ? <Loader2 size={17} className="spin" /> : q ? <button className="icon-btn tiny" onClick={() => setQ('')} aria-label="Clear search"><X size={15} /></button> : <kbd>Esc</kbd>}
      </div>
      {warning && <p className="inline-warning">{warning}</p>}
      <div className="search-results">
        {!loading && results.length === 0 && <div className="empty-small">No matches. Try a ticker such as AAPL or RELIANCE.NS.</div>}
        {results.map(s => {
          const saved = watchlist.includes(s.symbol);
          return (
            <div className="search-result" key={s.symbol}>
              <button className="search-result-main" onClick={() => onSelect(s.symbol)}>
                <StockLogo symbol={s.symbol} size={36} />
                <span className="search-result-text"><strong>{s.name}</strong><span>{s.symbol} · {s.exchange}{s.sector ? ` · ${s.sector}` : ''}</span></span>
                <span className={`market-tag market-${s.market}`}>{s.market === 'IN' ? 'India' : s.market === 'US' ? 'US' : s.market}</span>
                <ArrowUpRight size={16} className="muted" />
              </button>
              <button className={`icon-btn star-btn ${saved ? 'starred' : ''}`} onClick={() => onToggleWatch(s.symbol)} aria-label={saved ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`}><Star size={17} fill={saved ? 'currentColor' : 'none'} /></button>
            </div>
          );
        })}
      </div>
      <p className="modal-footnote">NSE tickers end in <code>.NS</code>, BSE tickers in <code>.BO</code>. Search is powered by Yahoo Finance.</p>
    </Modal>
  );
}
