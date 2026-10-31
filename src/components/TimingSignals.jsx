import React from 'react';
import { ArrowUpRight, ArrowDownRight, Clock3, CalendarDays, CheckCircle2, Circle, AlertCircle, ChevronRight, X, Activity, ShieldCheck } from 'lucide-react';
import Modal from './Modal.jsx';
import StockLogo from './StockLogo.jsx';
import { formatPrice, formatChange } from '../../shared/catalog.js';
import { timingBadge } from '../../shared/trade-plan.js';

export function formatStamp(ts, timeZone = 'UTC') {
  if (!Number.isFinite(ts)) return 'Timestamp unavailable';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(new Date(ts * 1000));
  } catch { return new Date(ts * 1000).toUTCString(); }
}

export function TimingBadge({ plan, small = false }) {
  const badge = timingBadge(plan);
  const Icon = badge.tone === 'buy' ? ArrowUpRight : badge.tone === 'sell' ? ArrowDownRight : badge.tone === 'warn' ? AlertCircle : Clock3;
  return <span className={`timing-badge timing-badge-${badge.tone} ${small ? 'timing-badge-small' : ''}`}><Icon size={small ? 12 : 14} />{badge.text}</span>;
}

function sessionText(plan) {
  if (!plan) return 'Session unknown';
  if (plan.stale) return 'Cached data';
  if (plan.marketState === 'open') return 'Regular session open';
  if (plan.marketState === 'closed') return 'Market closed';
  return 'Session unknown';
}

export function TimingCard({ item, mode = 'intraday', onSelect, onDetails, onRemove }) {
  const plan = item.timing?.[mode] || null;
  const up = (item.changePercent ?? 0) >= 0;
  const currency = item.currency || 'USD';
  return (
    <article className={`timing-card timing-card-${plan?.status || 'unavailable'} ${plan?.stale ? 'timing-card-stale' : ''}`}>
      <div className="timing-card-head">
        <button className="timing-stock" onClick={() => onSelect(item.symbol)} aria-label={`Open ${item.name} chart`}>
          <StockLogo symbol={item.symbol} size={38} />
          <span><strong>{item.name}</strong><span>{item.symbol} · {item.exchange || (item.market === 'IN' ? 'India' : 'US')}</span></span>
        </button>
        {onRemove && <button className="icon-btn tiny" onClick={() => onRemove(item.symbol)} aria-label={`Stop monitoring ${item.symbol}`} title="Stop monitoring"><X size={14} /></button>}
      </div>
      <div className="timing-price-row">
        <strong>{formatPrice(item.price, currency)}</strong>
        <span className={up ? 'pos' : 'neg'}>{formatChange(item.changePercent)}</span>
        <span className={`market-tag market-${item.market}`}>{item.market === 'IN' ? 'India' : 'US'}</span>
      </div>
      <TimingBadge plan={plan} />
      {plan && plan.status !== 'unavailable' ? (
        <div className="timing-levels">
          <div className="timing-level timing-level-buy"><span><ArrowUpRight size={13} />Buy when</span><strong>{formatPrice(plan.buyTrigger, currency)}</strong><p>Completed {mode === 'intraday' ? '5m' : 'daily'} close above, with confirmation.</p></div>
          <div className="timing-level timing-level-sell"><span><ArrowDownRight size={13} />Sell / exit when</span><strong>{formatPrice(plan.sellTrigger, currency)}</strong><p>Completed {mode === 'intraday' ? '5m' : 'daily'} close below, with confirmation.</p></div>
        </div>
      ) : <p className="timing-unavailable">{plan?.reason || 'Timing data is loading or unavailable. No trigger is invented.'}</p>}
      {item.timingWarning && <p className="inline-warning">{item.timingWarning}</p>}
      <div className="timing-card-meta">
        <span>{mode === 'intraday' ? <Clock3 size={12} /> : <CalendarDays size={12} />}{mode === 'intraday' ? 'Intraday · 5m' : 'Swing · daily'}</span>
        <span>{sessionText(plan)}</span>
      </div>
      <div className="timing-card-meta"><span>Bar: {formatStamp(plan?.barTime, plan?.timeZone || item.timezone)}</span><span>Quote: {formatStamp(plan?.quoteTime ?? item.marketTime, plan?.timeZone || item.timezone)}</span></div>
      <div className="timing-card-actions">
        <button className="text-btn" onClick={() => onSelect(item.symbol)}>View chart <ChevronRight size={13} /></button>
        <button className="text-btn" onClick={() => onDetails(item, mode)} disabled={!plan}>Why / conditions</button>
      </div>
    </article>
  );
}

export function TimingPanel({ plan, mode, currency, onSelectAll, onDetails }) {
  if (!plan) return null;
  const buyConditions = (plan.conditions || []).filter(c => c.side === 'buy');
  const sellConditions = (plan.conditions || []).filter(c => c.side === 'sell');
  return (
    <section className="card timing-panel">
      <div className="card-head">
        <div><h2>When to buy / sell <span className="count-chip">{mode === 'intraday' ? 'Intraday' : 'Swing'}</span></h2><p>Conditional timing from the latest completed {mode === 'intraday' ? '5-minute' : 'daily'} bar. Not a prediction or order.</p></div>
        <TimingBadge plan={plan} />
      </div>
      {plan.status === 'unavailable' ? <div className="table-empty"><AlertCircle size={22} /><strong>Timing unavailable</strong><span>{plan.reason}</span></div> : (
        <div className="timing-panel-grid">
          <div className="timing-rule-box timing-rule-buy">
            <h3><ArrowUpRight size={16} />Buy setup</h3>
            <div className="timing-trigger-price">{formatPrice(plan.buyTrigger, currency)}</div>
            <p>{plan.buyRule}</p>
            <ul>{buyConditions.map(c => <li key={c.id} className={c.met ? 'met' : ''}>{c.met ? <CheckCircle2 size={13} /> : <Circle size={13} />}{c.label}</li>)}</ul>
          </div>
          <div className="timing-rule-box timing-rule-sell">
            <h3><ArrowDownRight size={16} />Sell / exit watch</h3>
            <div className="timing-trigger-price">{formatPrice(plan.sellTrigger, currency)}</div>
            <p>{plan.sellRule}</p>
            <ul>{sellConditions.map(c => <li key={c.id} className={c.met ? 'met' : ''}>{c.met ? <CheckCircle2 size={13} /> : <Circle size={13} />}{c.label}</li>)}</ul>
          </div>
        </div>
      )}
      <p className="timing-reason">{plan.reason}</p>
      {plan.riskExample && <div className="info-callout"><ShieldCheck size={16} /><p>{plan.riskExample}{plan.riskReference != null && <> Invalidation reference: <strong>{formatPrice(plan.riskReference, currency)}</strong>; 2R reference: <strong>{formatPrice(plan.rewardReference, currency)}</strong>.</>}</p></div>}
      <div className="timing-panel-foot">
        <span>Completed bar: {formatStamp(plan.barTime, plan.timeZone)} · Quote: {formatStamp(plan.quoteTime, plan.timeZone)} · {sessionText(plan)}</span>
        <span>{plan.nextCheck}</span>
      </div>
      <div className="provider-actions">
        {onDetails && <button className="btn btn-ghost small" onClick={onDetails}>Full timing reasoning</button>}
        {onSelectAll && <button className="btn btn-primary small" onClick={onSelectAll}><Activity size={14} />All stock signals</button>}
      </div>
    </section>
  );
}

export function TimingDetailModal({ item, plan, mode, currency, onClose, onMethodology }) {
  if (!plan) return null;
  const buy = (plan.conditions || []).filter(c => c.side === 'buy');
  const sell = (plan.conditions || []).filter(c => c.side === 'sell');
  const Row = ({ c }) => <tr><td>{c.label}</td><td><span className={`vote-chip ${c.met ? 'pos' : 'neu'}`}>{c.met ? 'Met' : 'Not met'}</span></td><td>{c.detail}</td></tr>;
  return (
    <Modal title={`${item.symbol} · ${mode === 'intraday' ? 'Intraday' : 'Swing'} buy/sell timing`} subtitle={plan.strategy} onClose={onClose} wide>
      <div className="detail-verdict"><TimingBadge plan={plan} /><span>Bias: {plan.bias}</span><span>Completed bars: {plan.completedBars}</span></div>
      <p className="muted">{plan.reason}</p>
      <div className="indicator-grid">
        <div><span>Buy trigger</span><strong>{formatPrice(plan.buyTrigger, currency)}</strong></div>
        <div><span>Sell / exit trigger</span><strong>{formatPrice(plan.sellTrigger, currency)}</strong></div>
        <div><span>Completed close</span><strong>{formatPrice(plan.referencePrice, currency)}</strong></div>
        <div><span>ATR (14)</span><strong>{formatPrice(plan.atr, currency)}</strong></div>
        <div><span>Completed bar</span><strong>{formatStamp(plan.barTime, plan.timeZone)}</strong></div>
        <div><span>Quote timestamp</span><strong>{formatStamp(plan.quoteTime, plan.timeZone)}</strong></div>
      </div>
      <h3>Buy conditions</h3><p>{plan.buyRule}</p>
      <div className="table-wrap"><table className="rules-table"><thead><tr><th>Condition</th><th>Status</th><th>Detail</th></tr></thead><tbody>{buy.map(c => <Row key={c.id} c={c} />)}</tbody></table></div>
      <h3>Sell / exit conditions</h3><p>{plan.sellRule}</p>
      <div className="table-wrap"><table className="rules-table"><thead><tr><th>Condition</th><th>Status</th><th>Detail</th></tr></thead><tbody>{sell.map(c => <Row key={c.id} c={c} />)}</tbody></table></div>
      {plan.riskExample && <div className="info-callout"><ShieldCheck size={16} /><p>{plan.riskExample}{plan.riskReference != null && <> Invalidation reference: {formatPrice(plan.riskReference, currency)}; 2R reference: {formatPrice(plan.rewardReference, currency)}.</>}</p></div>}
      <div className="info-callout warn"><AlertCircle size={16} /><p>{plan.disclaimer} {plan.stale ? 'This response is cached.' : ''} {plan.marketState === 'closed' ? 'The market is closed; this is the last completed-bar state.' : ''} “Sell” means bearish/exit watch, not a short-sale instruction.</p></div>
      <button className="btn btn-ghost" onClick={onMethodology}>How signals work</button>
    </Modal>
  );
}
