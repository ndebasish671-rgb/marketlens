import React from 'react';
import { ExternalLink, Newspaper, AlertCircle, RefreshCw } from 'lucide-react';

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function sourceColor(source) {
  let h = 0;
  for (const ch of source) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 42%)`;
}

export default function NewsList({ items = [], loading = false, error = null, onRetry, layout = 'list', limit, unavailable = false }) {
  const list = limit ? items.slice(0, limit) : items;
  if (unavailable) return <div className="table-empty"><Newspaper size={22} /><strong>Headlines need an API connection</strong><span>Connect the backend to load news. No placeholder headlines are shown.</span></div>;
  if (error && !items.length) return <div className="table-empty"><AlertCircle size={22} /><strong>Headlines are unavailable</strong><span>The news feed didn’t respond. Your charts still work.</span>{onRetry && <button className="btn btn-ghost" onClick={onRetry}><RefreshCw size={14} />Retry</button>}</div>;
  if (loading && !items.length) return <div className={`news-${layout}`}>{Array.from({ length: layout === 'grid' ? 6 : 4 }).map((_, i) => <div className="news-skeleton" key={i}><span className="skeleton line" /><span className="skeleton line short" /></div>)}</div>;
  if (!list.length) return <div className="table-empty"><Newspaper size={22} /><strong>No headlines right now</strong><span>Try refreshing or choose another market.</span></div>;
  return (
    <div className={`news-${layout}`}>
      {list.map((n, i) => (
        <a className={`news-item ${layout === 'grid' ? 'news-card' : ''}`} href={n.link} target="_blank" rel="noopener noreferrer" key={`${n.title}-${i}`}>
          <div className="news-source-row">
            <span className="source-avatar" style={{ background: `${sourceColor(n.source)}18`, color: sourceColor(n.source) }}>{n.source.slice(0, 1).toUpperCase()}</span>
            <span className="news-source">{n.source}</span>
            <span className="news-time">{timeAgo(n.publishedAt)}</span>
          </div>
          <h3>{n.title}</h3>
          {layout === 'grid' && <span className="news-read">Read story <ExternalLink size={13} /></span>}
        </a>
      ))}
    </div>
  );
}
