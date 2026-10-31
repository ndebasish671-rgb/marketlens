import React from 'react';
import { KeyRound, ExternalLink, ShieldCheck, Loader2, CheckCircle2, AlertCircle, Copy, Globe, Database } from 'lucide-react';
import Modal from './Modal.jsx';
import { apiConfig, apiDisplayName } from '../lib/api.js';
import { resolveApiUrl } from '../../shared/api-config.js';

const BACKEND_VARS = `CORS_ORIGINS=https://YOUR-USERNAME.github.io
PUBLIC_DEPLOYMENT=true
TRUST_PROXY_HOPS=1`;
const LOCAL_VARS = `FINNHUB_API_KEY=your_key_here
FINNHUB_PERSONAL_USE_CONFIRMED=true
PUBLIC_DEPLOYMENT=false`;

function CopyBlock({ children, label }) {
  const [copyState, setCopyState] = React.useState('idle');
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(children); setCopyState('copied'); }
    catch { setCopyState('failed'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState('idle'), 2200);
  };
  return <div className="code-block"><div className="code-block-head"><span>{label}</span><button className="icon-btn tiny" onClick={copy} aria-label={`Copy ${label}`}><Copy size={13} /></button></div><pre>{children}</pre>{copyState !== 'idle' && <span className="copy-note" role="status">{copyState === 'copied' ? 'Copied' : 'Select the text to copy it manually.'}</span>}</div>;
}

export default function ProviderConnection({ status, testing, onTest, onClose }) {
  const state = status?.state || 'loading';
  const enabled = Boolean(status?.enabled);
  const publicBlocked = state === 'public_deployment';
  const title = !apiConfig.configured ? 'Backend API not configured' : publicBlocked ? 'Personal key blocked on public backend' : state === 'ready' ? 'Finnhub key enabled' : state === 'fallback' ? 'Finnhub key enabled · fallback active' : state === 'confirmation_required' ? 'Key saved · confirmation required' : state === 'not_configured' ? 'No optional Finnhub key' : state === 'error' ? 'Backend connection unavailable' : 'Checking connection…';
  return (
    <Modal title="API connection" subtitle="GitHub Pages frontend + a separately hosted Node API. Provider keys stay on the backend." onClose={onClose} wide>
      <div className={`provider-status provider-${state}`}>
        {state === 'loading' ? <Loader2 size={19} className="spin" /> : enabled && state !== 'fallback' ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
        <div><strong>{title}</strong><span>{!apiConfig.configured ? apiConfig.error : publicBlocked ? 'The dashboard keeps using Yahoo Finance. A personal Finnhub key cannot power a public/shared site.' : enabled ? 'Eligible US quotes can use Finnhub. Charts, Indian stocks, search and news keep their existing sources.' : 'The API uses the free Yahoo Finance fallback. An optional key is not required.'}</span></div>
      </div>

      <div className="connection-endpoint"><Globe size={16} /><div><span>Frontend API base URL</span><code>{apiDisplayName}</code></div>{apiConfig.configured && <a href={resolveApiUrl('/api/health', apiConfig)} target="_blank" rel="noopener noreferrer" aria-label="Open API health check"><ExternalLink size={15} /></a>}</div>

      <h3>1. Deploy the Node backend</h3>
      <p>Use the included <code>render.yaml</code> blueprint or <code>Dockerfile</code> on a Node host. GitHub Pages cannot run this server. Set these environment variables on the <strong>backend host</strong>, replacing the example with your exact GitHub Pages origin.</p>
      <CopyBlock label="Backend host environment variables">{BACKEND_VARS}</CopyBlock>
      <p className="modal-footnote">Use the origin only: <code>https://username.github.io</code>, without <code>/repository</code> or a trailing slash. Add a custom-domain origin as another comma-separated entry. <code>TRUST_PROXY_HOPS=1</code> is for a single trusted reverse proxy, such as the included Render setup; use <code>0</code> for a direct local server.</p>

      <h3>2. Connect GitHub Pages</h3>
      <p>In your repository, open <strong>Settings → Secrets and variables → Actions → Variables</strong>. Create the repository variable <code>API_BASE_URL</code> with your backend’s HTTPS URL, for example <code>https://your-marketlens-api.onrender.com</code>. This URL is public; it is <strong>not</strong> an API key.</p>
      <p>Set <strong>Settings → Pages → Build and deployment → Source</strong> to <strong>GitHub Actions</strong>, push to <code>main</code>, and let the included workflow deploy. After changing the variable, rerun the workflow. For a root Pages site or custom domain, also set <code>PAGES_BASE_PATH=/</code>.</p>

      <h3>3. Optional: a personal Finnhub key</h3>
      <p>Only for a <strong>private/local backend serving your own personal use</strong>: create a Finnhub account, then add the variables below to that backend’s environment or its local <code>.env</code> file. Restart the server. Never put the key in GitHub, a <code>VITE_*</code> variable, this website, or chat.</p>
      <CopyBlock label="Private/local backend .env">{LOCAL_VARS}</CopyBlock>
      <a className="btn btn-ghost small" href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer"><KeyRound size={14} />Open Finnhub signup <ExternalLink size={13} /></a>
      <div className="info-callout warn"><AlertCircle size={18} /><p><strong>Public Pages safeguard:</strong> <code>PUBLIC_DEPLOYMENT=true</code> disables the personal Finnhub adapter even if a key and confirmation are present. Personal plans do not permit redistribution or sharing data/derived results. A public/shared service needs an appropriate commercial/display license, not a hidden personal key.</p></div>

      <h3>4. Check the connection</h3>
      <div className="provider-scope">
        <div><span>US quote headers</span><strong>{enabled ? 'Finnhub when available' : 'Yahoo Finance'}</strong></div>
        <div><span>Indian stocks</span><strong>Yahoo Finance</strong></div>
        <div><span>Charts & signals</span><strong>Yahoo Finance candles</strong></div>
        <div><span>News</span><strong>Google News RSS</strong></div>
      </div>
      <p>The optional provider test makes one keyed AAPL quote request. It never returns the key. Without a key, the dashboard still works through the fallback.</p>
      <div className="provider-actions">
        <button className="btn btn-primary small" onClick={onTest} disabled={!enabled || testing}>{testing ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}{testing ? 'Testing…' : 'Test Finnhub connection'}</button>
        {!enabled && <span className="muted">{publicBlocked ? 'Disabled for public-deployment license safety.' : !apiConfig.configured ? 'Connect the backend first.' : 'No enabled personal key; Yahoo fallback is active.'}</span>}
        {status?.lastErrorCode && <span className="inline-warning">Last provider issue: {status.lastErrorCode}. Fallback remains available.</span>}
      </div>
      <div className="info-callout"><Database size={18} /><p><strong>CORS is not access control.</strong> Anyone can still call a public API directly. The backend has rate limits and caching, but no login. Yahoo endpoints are unofficial, and Google News RSS needs appropriate rights for public redistribution. See the README before publishing.</p></div>
      <p className="modal-footnote">References: <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages" target="_blank" rel="noopener noreferrer">GitHub Pages workflows</a> · <a href="https://finnhub.io/pricing" target="_blank" rel="noopener noreferrer">Finnhub pricing</a> · <a href="https://finnhub.io/terms-of-service" target="_blank" rel="noopener noreferrer">Terms</a></p>
    </Modal>
  );
}
