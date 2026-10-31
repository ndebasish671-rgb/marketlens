import React from 'react';
import { Clock3, CalendarDays, ArrowUpRight, ArrowDownRight, Minus, ChevronRight, Info } from 'lucide-react';
import { TimingBadge } from './TimingSignals.jsx';

export function VerdictBadge({ verdict, small = false }) {
  const v = (verdict || 'Unavailable').toLowerCase();
  const Icon = v === 'buy' ? ArrowUpRight : v === 'sell' ? ArrowDownRight : Minus;
  return <span className={`verdict verdict-${v} ${small ? 'verdict-small' : ''}`}><Icon size={small ? 12 : 15} strokeWidth={2.5} />{verdict || 'Unavailable'}</span>;
}

export default function SignalCard({ analysis, active, onSelect, onDetails, unavailable = false, plan = null }) {
  const intraday = analysis?.mode === 'intraday';
  const Icon = intraday ? Clock3 : CalendarDays;
  const verdict = analysis?.verdict || 'Unavailable';
  const v = verdict.toLowerCase();
  const topRules = (analysis?.rules || []).filter(r => r.vote !== 0).slice(0, 2);
  const rules = topRules.length ? topRules : (analysis?.rules || []).slice(0, 1);
  return (
    <article className={`signal-card signal-${v} ${active ? 'signal-active' : ''}`}>
      <button className="signal-select" onClick={onSelect} aria-pressed={active} aria-label={`Show ${intraday ? 'intraday' : 'swing'} chart`}>
        <span className="signal-title"><Icon size={15} />{intraday ? 'Intraday' : 'Swing'}<span className="bar-chip">{intraday ? '5m bars' : '1D bars'}</span></span>
        {active && <span className="active-dot" title="Chart timeframe" />}
      </button>
      <div className="signal-verdict-row">
        <VerdictBadge verdict={verdict} />
        {analysis?.alignment != null && <span className="alignment-label">{analysis.alignment}% aligned</span>}
      </div>
      {analysis?.alignment != null && <div className="alignment-track" aria-hidden="true"><span style={{ width: `${Math.max(analysis.alignment, 4)}%` }} /></div>}
      <p className="signal-counts">{analysis?.score == null ? analysis?.reason || (unavailable ? 'Connect the API to calculate signals.' : 'Waiting for enough history…') : `${analysis.bullish} bullish · ${analysis.bearish} bearish · ${analysis.neutral} neutral`}</p>
      {plan && <div className="signal-timing"><TimingBadge plan={plan} small /></div>}
      <ul className="signal-reasons">
        {rules.map(r => <li key={r.id}><span className={`rule-dot ${r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : 'neu'}`} />{r.detail}</li>)}
      </ul>
      <button className="text-btn signal-details" onClick={onDetails}>See full reasoning <ChevronRight size={14} /></button>
    </article>
  );
}

export function SignalDisclaimer({ onLearn }) {
  return <div className="signal-disclaimer"><Info size={14} /><span>Educational heuristics, not investment advice or a forecast. <button onClick={onLearn}>How it works</button></span></div>;
}
