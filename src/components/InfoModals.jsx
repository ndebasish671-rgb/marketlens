import React from 'react';
import { ShieldCheck, Database, ExternalLink, FlaskConical, AlertTriangle, Globe } from 'lucide-react';
import Modal from './Modal.jsx';
import { VerdictBadge } from './SignalCard.jsx';
import { formatNumber, formatPrice, formatCompact } from '../../shared/catalog.js';

export function MethodologyModal({ onClose }) {
  return (
    <Modal title="How the signals work" subtitle="Transparent rules. No black box. No promises." onClose={onClose} wide>
      <div className="info-callout"><FlaskConical size={19} /><p>MarketLens labels <strong>technical setups</strong>, not personalized recommendations. A “Buy” or “Sell” badge means the rules below lean that way under current data — it is not a forecast, an order, or a guarantee.</p></div>
      <h3>Two timeframes, two rule sets</h3>
      <div className="method-grid">
        <div className="method-card"><h4>Intraday · 5-minute bars</h4><p>Uses the last five sessions of 5-minute bars for indicator warm-up. Six equally weighted rules: trend, MACD, RSI, 5-bar momentum, volume confirmation, and session VWAP.</p></div>
        <div className="method-card"><h4>Swing · daily bars</h4><p>Uses one year of daily bars. Five equally weighted rules: trend, MACD, RSI, 5-bar momentum, and volume confirmation. Intended for days-to-weeks context, not entry timing.</p></div>
      </div>
      <h3>The rules</h3>
      <div className="table-wrap"><table className="rules-table"><thead><tr><th>Indicator</th><th>Bullish (+1)</th><th>Bearish (−1)</th><th>Neutral (0)</th></tr></thead><tbody>
        <tr><td>Trend structure</td><td>Close &gt; SMA20 &gt; SMA50</td><td>Close &lt; SMA20 &lt; SMA50</td><td>Not aligned</td></tr>
        <tr><td>MACD (12,26,9)</td><td>MACD &gt; signal line</td><td>MACD &lt; signal line</td><td>Equal</td></tr>
        <tr><td>RSI (14)</td><td>RSI &lt; 30 (oversold)</td><td>RSI &gt; 70 (overbought)</td><td>30–70</td></tr>
        <tr><td>5-bar momentum</td><td>ROC &gt; +0.4% intraday / +1% swing</td><td>ROC &lt; −0.4% / −1%</td><td>Inside band</td></tr>
        <tr><td>Volume confirmation</td><td>Volume ≥ 1.5× 20-bar avg on an up bar</td><td>Same on a down bar</td><td>Otherwise</td></tr>
        <tr><td>Session VWAP (intraday only)</td><td>Close &gt; VWAP</td><td>Close &lt; VWAP</td><td>Equal / unavailable</td></tr>
      </tbody></table></div>
      <h3>From votes to a badge</h3>
      <p>Score = 50 + 50 × (net votes ÷ number of rules). <strong>Buy</strong> at score ≥ 67, <strong>Sell</strong> at score ≤ 33, otherwise <strong>Hold</strong>. “Aligned” is the absolute distance from 50, doubled — it measures indicator agreement, <em>not</em> probability of profit.</p>
      <h3>Buy / sell timing (when)</h3>
      <p>The timing monitor adds a separate, conditional entry/exit rule on top of the bias score. It uses <strong>completed bars only</strong>: 5-minute bars for intraday and daily bars for swing. A buy setup requires a completed close above the prior 20-bar high, above SMA 20, with positive MACD, and above session VWAP for intraday. A sell/exit setup requires a completed close below the prior 20-bar low, below SMA 20, with negative MACD, and below session VWAP for intraday. If confirmation is missing, the state is Wait.</p>
      <p>Trigger levels are prior 20-bar highs/lows, not predicted future prices. The optional risk example is educational only: invalidation 1.5×ATR below the completed close and a 2R reference 3×ATR above. It is not a recommended stop-loss or target. “Sell” means bearish/exit watch, not a short-sale instruction.</p>
      <h3>Important limitations</h3>
      <ul className="info-list">
        <li>RSI is used here as a mean-reversion heuristic; oversold can stay oversold and overbought can stay overbought.</li>
        <li>The latest bar may still be forming, so signals can change before the bar closes.</li>
        <li>No backtest, win rate, transaction-cost model, slippage model, or fundamental valuation is included.</li>
        <li>News, earnings, gaps, liquidity, and broader market risk can invalidate any technical setup.</li>
        <li>Free quote data may be delayed or unavailable. Always check the quote timestamp and your broker before acting.</li>
      </ul>
      <div className="info-callout warn"><AlertTriangle size={18} /><p>This dashboard is for education and research. It does not know your finances, goals, or risk tolerance, and it cannot execute trades.</p></div>
    </Modal>
  );
}

export function SourcesModal({ onClose }) {
  return (
    <Modal title="Data & sources" subtitle="What is live, what is delayed, and what is free." onClose={onClose} wide>
      <div className="source-block"><Database size={20} /><div><h3>Prices, candles & search — Yahoo Finance</h3><p>Quotes and OHLCV history come from Yahoo Finance’s public chart endpoint via a server-side proxy. The app polls about every 60 seconds while the tab is visible; the server caches quote responses for about 45 seconds. This is <strong>not a guaranteed exchange-real-time feed</strong>. Exchange delays vary and may not be reported by the provider.</p><p>Every quote shows its source timestamp. “Market closed” means the current time is outside the provider’s regular trading period; it is not a holiday calendar. If the provider fails, cached data may be shown and is labeled stale.</p><a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer">Yahoo Finance <ExternalLink size={13} /></a></div></div>
      <div className="source-block"><Database size={20} /><div><h3>Optional US quotes — Finnhub API key</h3><p>If you add a server-side <code>FINNHUB_API_KEY</code> and confirm personal use, eligible US quote headers can use Finnhub. Indian stocks, historical candles, signal inputs, search and news remain on their existing sources. Finnhub historical candles are premium, so the app does not mix provider quotes into Yahoo candles or pretend the signals use Finnhub history.</p><p><strong>License:</strong> personal plans are for personal, non-commercial use and do not allow redistribution or sharing data/derived results with third parties. Do not use a personal key for a public/shared dashboard. Configure the key only on a private/local backend under <strong>API connection</strong>; it is never sent to the browser. <code>PUBLIC_DEPLOYMENT=true</code> disables this personal adapter on the public GitHub Pages + API setup.</p><a href="https://finnhub.io/pricing" target="_blank" rel="noopener noreferrer">Finnhub pricing & terms <ExternalLink size={13} /></a></div></div>
      <div className="source-block"><Database size={20} /><div><h3>Headlines — Google News RSS</h3><p>Stock-specific and market headlines are fetched from Google News RSS and link out to the original coverage via Google News. The feed is cached for about five minutes.</p><p><strong>Usage restriction:</strong> Google’s RSS feed states it is for personal, non-commercial feed-reader use. A public or commercial deployment needs appropriate news licensing or a permitted feed. This build does not scrape Google Finance prices or claim an official Google Finance API.</p><a href="https://news.google.com" target="_blank" rel="noopener noreferrer">Google News <ExternalLink size={13} /></a></div></div>
      <div className="source-block"><Database size={20} /><div><h3>Charts — TradingView Lightweight Charts</h3><p>Interactive candlestick, line, volume, RSI and MACD charts are rendered with TradingView Lightweight Charts™. This product includes software developed by TradingView, Inc.</p><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">tradingview.com <ExternalLink size={13} /></a></div></div>
      <div className="source-block"><ShieldCheck size={20} /><div><h3>Signals — local, deterministic rules</h3><p>All indicators and Buy/Sell/Hold badges are calculated from the fetched candles using the published rules. No hidden AI score, no fabricated “win rate,” and no brokerage connection.</p></div></div>
      <div className="source-block"><Globe size={20} /><div><h3>Hosting — GitHub Pages + Node API</h3><p>GitHub Pages serves the static React interface. A separate Node backend fetches market data and news, applies caching/rate limits, and keeps optional provider credentials server-side. The frontend’s API base URL is public configuration, not a secret. CORS allows the configured Pages origin but does not authenticate callers.</p><a href="https://docs.github.com/en/pages" target="_blank" rel="noopener noreferrer">GitHub Pages documentation <ExternalLink size={13} /></a></div></div>
      <div className="info-callout warn"><AlertTriangle size={18} /><p>For a production trading product, use a licensed real-time market-data vendor, verify exchange entitlements, and obtain legal review for news redistribution and financial disclosures.</p></div>
    </Modal>
  );
}

export function SignalDetailModal({ analysis, symbol, currency, onClose, onMethodology }) {
  if (!analysis) return null;
  const ind = analysis.indicators || {};
  const title = `${symbol} · ${analysis.mode === 'intraday' ? 'Intraday' : 'Swing'} reasoning`;
  return (
    <Modal title={title} subtitle={`${analysis.barCount || 0} bars analyzed · ${analysis.mode === 'intraday' ? '5-minute' : 'daily'} candles`} onClose={onClose} wide>
      <div className="detail-verdict"><VerdictBadge verdict={analysis.verdict} /><span>Score {analysis.score ?? '—'} / 100</span><span>{analysis.alignment ?? '—'}% indicator alignment</span></div>
      <p className="muted">{analysis.reason}</p>
      {analysis.rules?.length > 0 && <div className="table-wrap"><table className="rules-table detail-rules"><thead><tr><th>Rule</th><th>Vote</th><th>Why</th></tr></thead><tbody>
        {analysis.rules.map(r => <tr key={r.id}><td><strong>{r.label}</strong></td><td><span className={`vote-chip ${r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : 'neu'}`}>{r.vote > 0 ? '+1' : r.vote < 0 ? '−1' : '0'}</span></td><td>{r.detail}</td></tr>)}
      </tbody></table></div>}
      <h3>Indicator snapshot</h3>
      <div className="indicator-grid">
        <div><span>RSI (14)</span><strong>{formatNumber(ind.rsi, 1)}</strong></div>
        <div><span>MACD</span><strong>{formatNumber(ind.macd, 3)}</strong></div>
        <div><span>MACD signal</span><strong>{formatNumber(ind.macdSignal, 3)}</strong></div>
        <div><span>SMA 20</span><strong>{formatPrice(ind.sma20, currency)}</strong></div>
        <div><span>SMA 50</span><strong>{formatPrice(ind.sma50, currency)}</strong></div>
        <div><span>EMA 20</span><strong>{formatPrice(ind.ema20, currency)}</strong></div>
        <div><span>Bollinger upper / lower</span><strong>{formatNumber(ind.bbUpper, 2)} / {formatNumber(ind.bbLower, 2)}</strong></div>
        <div><span>ATR (14)</span><strong>{formatNumber(ind.atr, 2)} ({formatNumber(ind.atrPercent, 2)}%)</strong></div>
        {analysis.mode === 'intraday' && <div><span>Session VWAP</span><strong>{formatPrice(ind.vwap, currency)}</strong></div>}
        <div><span>Volume / 20-bar avg</span><strong>{formatNumber(ind.volumeRatio, 2)}×</strong></div>
        <div><span>20-bar low</span><strong>{formatPrice(ind.support, currency)}</strong></div>
        <div><span>20-bar high</span><strong>{formatPrice(ind.resistance, currency)}</strong></div>
      </div>
      <p className="modal-footnote">The 20-bar high/low are observed ranges, not validated support/resistance or trade targets. ATR measures recent volatility, not a stop-loss recommendation.</p>
      <button className="btn btn-ghost" onClick={onMethodology}>Read the full methodology</button>
    </Modal>
  );
}
