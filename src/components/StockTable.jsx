import React, { useMemo, useState } from 'react';
import { Star, ChevronRight, ArrowUpDown, AlertCircle, RefreshCw, Database } from 'lucide-react';
import StockLogo from './StockLogo.jsx';
import Sparkline from './Sparkline.jsx';
import { VerdictBadge } from './SignalCard.jsx';
import { formatPrice, formatChange, formatNumber } from '../../shared/catalog.js';

export default function StockTable({ items = [], watchlist = [], onToggleWatch, onSelect, loading = false, error = null, onRetry, sortable = false, compact = false, emptyTitle = 'No stocks here yet', emptyText = 'Add stocks from search to build your watchlist.', unavailable = false }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sortable || !sort.key) return items;
    const val = x => sort.key === 'rsi' ? x.swing?.rsi : sort.key === 'name' ? x.name : x[sort.key];
    return [...items].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sort.dir;
    });
  }, [items, sort, sortable]);
  const toggleSort = key => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }));
  const Th = ({ k, children, className = '' }) => sortable ? <th className={className}><button className="th-sort" onClick={() => toggleSort(k)}>{children}<ArrowUpDown size={12} /></button></th> : <th className={className}>{children}</th>;

  if (unavailable) return <div className="table-empty"><Database size={22} /><strong>API not connected</strong><span>Connect your backend to load stock prices and signals.</span></div>;
  if (error && !items.length) return <div className="table-empty"><AlertCircle size={22} /><strong>Couldn’t load stocks</strong><span>{error}</span>{onRetry && <button className="btn btn-ghost" onClick={onRetry}><RefreshCw size={14} />Retry</button>}</div>;
  if (loading && !items.length) return <div className="table-skeleton">{Array.from({ length: 5 }).map((_, i) => <div className="skeleton-row" key={i}><span className="skeleton circle" /><span className="skeleton line" /><span className="skeleton line short" /></div>)}</div>;
  if (!items.length) return <div className="table-empty"><Star size={24} /><strong>{emptyTitle}</strong><span>{emptyText}</span></div>;

  return (
    <div className="table-wrap">
      <table className={`stock-table ${compact ? 'compact' : ''}`}>
        <thead><tr>
          <Th k="name">Company</Th>
          <Th k="price" className="num">Price</Th>
          <Th k="changePercent" className="num">Day change</Th>
          {!compact && <Th k="rsi" className="num">RSI (14)</Th>}
          <th>Swing signal</th>
          <th className="trend-col">5-session trend</th>
          <th className="action-col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {sorted.map(s => {
            const saved = watchlist.includes(s.symbol);
            const up = (s.changePercent ?? 0) >= 0;
            return (
              <tr key={s.symbol} onClick={() => onSelect(s.symbol)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onSelect(s.symbol); }} aria-label={`Analyze ${s.name}`}>
                <td><div className="table-company"><StockLogo symbol={s.symbol} size={34} /><div><strong>{s.name}</strong><span>{s.symbol} · {s.exchange}</span></div></div></td>
                <td className="num price-cell">{formatPrice(s.price, s.currency)}</td>
                <td className={`num ${up ? 'pos' : 'neg'}`}>{formatChange(s.changePercent)}</td>
                {!compact && <td className="num muted">{formatNumber(s.swing?.rsi, 1)}</td>}
                <td><VerdictBadge verdict={s.swing?.verdict || 'Unavailable'} small /></td>
                <td className="trend-col"><Sparkline values={(s.candles || []).slice(-5).map(c => c.close)} width={96} height={30} color={up ? '#10a779' : '#ef6b73'} /></td>
                <td className="action-col"><div className="row-actions">
                  <button className={`icon-btn tiny star-btn ${saved ? 'starred' : ''}`} onClick={e => { e.stopPropagation(); onToggleWatch(s.symbol); }} aria-label={saved ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`}><Star size={15} fill={saved ? 'currentColor' : 'none'} /></button>
                  <ChevronRight size={15} className="muted row-chevron" />
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
