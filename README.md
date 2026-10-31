# MarketLens

A free, full-stack stock-analysis dashboard for **Indian (NSE/BSE) and US (NYSE/Nasdaq)** markets.

**Recommended deployment: GitHub Pages for the frontend + a separate Node API backend.** GitHub Pages serves the React interface; the Node service fetches data, calculates signals, caches responses and keeps optional provider credentials off the browser.

> **Important:** Educational research only — not investment advice, not a trading system, and not a guarantee of profit. Signals are deterministic technical heuristics, not predictions. Free data may be delayed or unavailable.

## What it does

- **Market pulse:** NIFTY 50, SENSEX, S&P 500 and Nasdaq Composite with recent trend sparklines.
- **Interactive charts:** candlestick / line, volume, SMA 20, SMA 50, EMA 20, Bollinger Bands, session VWAP, RSI (14) and MACD (12,26,9). Drag to pan, scroll/pinch to zoom.
- **Two signal timeframes:** intraday (5-minute bars) and swing (daily bars), side by side with transparent Buy / Sell / Hold reasoning.
- **Live buy/sell timing:** a dedicated monitor shows conditional “buy when” and “sell/exit when” trigger levels for every monitored stock, using completed bars, trend/MACD/VWAP confirmation, quote timestamps, market-open/closed state and stale-data labels. It auto-checks about every 60 seconds while the tab is visible.
- **Stock search:** Yahoo Finance search plus a built-in NSE/US catalogue.
- **Watchlist:** up to 12 stocks, saved in this browser.
- **Screener:** featured Indian and US equities with market/signal filters and sorting.
- **News:** stock-specific and market headlines from Google News RSS, linking to publishers.
- **Auto-refresh:** about every 60 seconds while the tab is visible, with pause/resume and manual refresh.
- **Honest status:** quote timestamps, session status, delayed-data wording, stale-cache warnings and a clear API-not-configured state.

## Live buy/sell timing

The **Buy / Sell signals** page monitors the 16 featured stocks plus the 8 most recently opened custom symbols. Every stock you open also gets a timing panel on the overview chart. The monitor is not an order system and does not claim exchange-real-time data.

Timing rules use **completed bars only**:

- **Buy setup:** completed close above the prior 20-bar high, above SMA 20, positive MACD, and above session VWAP for intraday.
- **Sell/exit setup:** completed close below the prior 20-bar low, below SMA 20, negative MACD, and below session VWAP for intraday.
- **Wait:** any required confirmation is missing, data is insufficient, or the response is stale/cached.

The API exposes this through `/api/market?timing=1`, which returns `timing.intraday` and `timing.swing` plans for stocks. The frontend also computes the selected stock’s plan from `/api/analysis` candles. Trigger levels are observed prior 20-bar highs/lows, not forecasts. The optional ATR risk example is educational only.

## Architecture

```text
Browser → GitHub Pages (static React build)
              │  HTTPS fetches to VITE_API_BASE_URL
              ▼
          Node / Express API (separate host)
              ├── Yahoo Finance: quotes, candles, search
              ├── Google News RSS: headlines
              └── Optional Finnhub: private/personal US quote headers only
```

GitHub Pages **cannot run `server.js` or hide a provider key**. Uploading only `dist/` without a backend will not provide live data. All frontend API calls go through `src/lib/api.js`; the backend URL is public build-time configuration.

## Deploy with GitHub Pages + Render

The included `render.yaml` is an optional blueprint for the API. Render’s free plan may sleep, cold-start, have usage limits, or be blocked/rate-limited by upstream data sources. Verify the deployed API before relying on it. Another Node/Docker host works too.

### 1. Put the project on GitHub

Create a repository and upload the **contents** of the `marketlens` folder to the repository root. `package.json`, `render.yaml` and `.github/workflows/deploy-pages.yml` must be at the root, not inside an extra nested folder.

```bash
cd marketlens
git init
git add .
git commit -m "Add MarketLens with GitHub Pages deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Do not commit `.env`, `.dev.vars`, `node_modules/`, or a real key. The included `.gitignore` excludes them. If a key was ever pasted into chat or committed, rotate it at the provider.

### 2. Deploy the Node API

In Render: **New → Blueprint → connect this repository → branch `main`**. The blueprint creates one API web service, not a static site.

When prompted for `CORS_ORIGINS`, enter your exact GitHub Pages **origin**:

```text
https://YOUR-USERNAME.github.io
```

Do **not** include `/YOUR-REPO`, a trailing slash, or a wildcard. For a custom frontend domain, use that origin instead; multiple origins are comma-separated.

After deployment, copy the service URL, for example:

```text
https://your-marketlens-api.onrender.com
```

Open `https://your-marketlens-api.onrender.com/api/health`. It should return JSON containing `"service":"marketlens-api"` and `"ok":true`. Also test:

```text
/api/analysis?symbol=AAPL
/api/analysis?symbol=RELIANCE.NS
/api/news?topic=india
```

If Yahoo or Google blocks the host, the API will report the failure rather than inventing data. Try another backend host or use appropriately licensed feeds.

The blueprint sets:

| Backend variable | Value | Purpose |
|---|---|---|
| `PUBLIC_DEPLOYMENT` | `true` | Disables the personal Finnhub adapter on a public/shared backend |
| `TRUST_PROXY_HOPS` | `1` | Trust one reverse-proxy hop for client-IP rate limiting on Render |
| `CORS_ORIGINS` | your Pages origin | Exact browser-origin allowlist |
| `NODE_ENV` | `production` | Production runtime |

No Finnhub key is included in the blueprint. Do not add a personal key to this public service.

### 3. Configure and deploy GitHub Pages

1. Repository **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - Name: `API_BASE_URL`
   - Value: your backend HTTPS origin, e.g. `https://your-marketlens-api.onrender.com`
3. Push to `main`, or open **Actions → Deploy frontend to GitHub Pages → Run workflow**.
4. The workflow validates the URL, runs unit tests, builds with the repository base path, uploads `dist/`, and deploys it.
5. Open the Pages URL shown in the workflow’s deploy job, e.g. `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

`API_BASE_URL` is a **public repository variable**, not a secret. The workflow injects it as `VITE_API_BASE_URL`. Never put a provider key in either variable: all `VITE_*` values are embedded in the downloaded JavaScript.

The base path is derived automatically:

| Site | Base path |
|---|---|
| `https://user.github.io/marketlens/` | `/marketlens/` |
| `https://user.github.io/` from `user.github.io` repo | `/` |
| Custom domain at the domain root | set repository variable `PAGES_BASE_PATH=/` |

After changing `API_BASE_URL` or `PAGES_BASE_PATH`, **rerun the workflow**. Changing a variable does not rebuild an already deployed frontend.

GitHub Pages is available with GitHub Free on public repositories; private-repository availability depends on the GitHub plan. The workflow uses `pages: write` and `id-token: write` only in the deploy job.

### Alternative backend: Docker

The Docker image is API-only and defaults to `PUBLIC_DEPLOYMENT=true`:

```bash
docker build -t marketlens-api .
docker run --rm -p 3000:3000 \
  -e CORS_ORIGINS=https://YOUR-USERNAME.github.io \
  -e TRUST_PROXY_HOPS=0 \
  marketlens-api
```

Put the container behind HTTPS on your host. Set `TRUST_PROXY_HOPS` to the actual number of trusted reverse-proxy hops; do not blindly trust arbitrary forwarded headers. The image runs as the non-root `node` user and has a health check.

## Run locally

### Simplest: one server for frontend + API

```bash
npm ci
npm run build
npm start
# http://localhost:3000
```

Leave `VITE_API_BASE_URL` unset. The frontend uses relative `/api/*` URLs on the same origin.

### Separate Vite frontend + Node API

Terminal 1:

```bash
cp .env.example .env
npm run dev
# API on http://localhost:3000
```

Terminal 2:

```bash
cp frontend.env.example .env.local
npm run dev:frontend
# frontend on http://localhost:5173
```

The example backend CORS list allows `http://localhost:5173` and `http://127.0.0.1:5173`. Use matching hostnames in the browser and API URL. Vite’s dev/preview servers are for development, not production hosting.

## Optional Finnhub key — private/personal use only

The app works without a key. An optional server-side `FINNHUB_API_KEY` can enrich eligible **US quote headers**; it does not replace candles, Indian stocks, search, news or signal inputs.

| Data | Without key | With enabled private Finnhub key |
|---|---|---|
| Eligible US quote header | Yahoo Finance | Finnhub when available; Yahoo fallback |
| Indian stocks | Yahoo Finance | Yahoo Finance |
| Charts / candles | Yahoo Finance | Yahoo Finance |
| Buy/Sell/Hold inputs | Yahoo Finance candles | Yahoo Finance candles |
| Search | Yahoo Finance | Yahoo Finance |
| News | Google News RSS | Google News RSS |

For a **private/local** Node backend only:

```dotenv
FINNHUB_API_KEY=your_real_key_here
FINNHUB_PERSONAL_USE_CONFIRMED=true
PUBLIC_DEPLOYMENT=false
```

Add these to the backend host’s secret environment or local `.env`, then restart. Open **API connection → Test Finnhub connection**. The key is sent to Finnhub in the `X-Finnhub-Token` header, never in a URL, browser response or frontend bundle.

**Public-deployment guard:** when `PUBLIC_DEPLOYMENT=true`, the Finnhub adapter stays disabled even if a key and personal-use confirmation are present. If the flag is unset, `NODE_ENV=production` also defaults to the public guard; a genuinely private production backend must explicitly set `PUBLIC_DEPLOYMENT=false`. Finnhub personal plans do not permit redistribution or sharing data/derived results with third parties. Hiding a personal key on a server does not grant permission to power a public dashboard. Obtain an appropriate license for public/shared use.

The adapter uses a 40-request/minute local budget, 45-second cache, request deduplication, and auth/rate-limit cooldowns. Provider failures fall back to Yahoo with a warning. Finnhub candles are premium, so the app never splices a Finnhub quote into Yahoo candles or claims the signals use Finnhub history.

References: [Finnhub pricing](https://finnhub.io/pricing), [terms](https://finnhub.io/terms-of-service), [authentication](https://finnhub.io/docs/api/authentication).

## Data sources, rights & limitations

| Source | Used for | Caveat |
|---|---|---|
| Yahoo Finance public chart/search endpoints | Quotes, OHLCV candles, search | Unofficial; may be delayed, rate-limited or blocked. Not guaranteed exchange-real-time. Verify rights before a public/production service. |
| Google News RSS | Headlines | Personal, non-commercial feed-reader use. Public/commercial redistribution needs appropriate rights or a permitted/licensed feed. |
| Finnhub (optional) | Eligible US quote headers | Personal-use restrictions; public adapter disabled by default. Candles are premium. |
| TradingView Lightweight Charts | Chart rendering | This product includes software developed by TradingView, Inc. https://www.tradingview.com/ |

There is **no official Google Finance public price API** used here. The app does not scrape Google Finance. “Live” means fetching the latest available upstream data, not a guaranteed real-time exchange feed.

**CORS is not authentication.** It restricts browser reads from other origins, but anyone can call a public API directly. The API has per-IP rate limits and caching, not user accounts. Add authentication/abuse controls and licensed data before operating a shared production service.

## Tests

```bash
npm test
npm run build
node test/browser.mjs
# First time only: npx playwright install --with-deps chromium
```

Unit tests cover indicators/signals, completed-bar buy/sell timing, API-base normalization, Pages base paths, exact-origin CORS, real HTTP preflight/rejection, and the Finnhub adapter/public-deployment guard. The browser smoke test exercises the all-in-one app, including the Buy / Sell signals page, against `http://127.0.0.1:3000` (override with `BASE_URL`).

For a split-hosting browser check, build under a project path, serve that build statically, run the API on another port with the static server’s origin in `CORS_ORIGINS`, then run:

```bash
PAGES_URL=http://127.0.0.1:4173/marketlens/ \
API_URL=http://127.0.0.1:3001 \
node test/pages-browser.mjs
```

The split test verifies asset base paths, cross-origin data loading, search, preflight, and the unconfigured-API state. It does not deploy anything to GitHub or Render.

## Signal methodology (summary)

Each rule votes +1 (bullish), −1 (bearish) or 0 (neutral). Rules are equally weighted.

- **Trend:** close vs SMA20 vs SMA50 alignment.
- **MACD:** MACD line vs signal line.
- **RSI:** mean-reversion heuristic — below 30 bullish, above 70 bearish.
- **Momentum:** 5-bar rate of change beyond ±0.4% intraday / ±1% swing.
- **Volume:** ≥1.5× 20-bar average on an up/down bar.
- **VWAP:** intraday only — close above/below session VWAP.

Score = `50 + 50 × net votes / rule count`. **Buy** ≥ 67, **Sell** ≤ 33, otherwise **Hold**. “Alignment” measures indicator agreement, not probability of profit. At least 60 bars are required. The latest bar may still be forming. No backtest, win rate, slippage, transaction costs or fundamental valuation is included.

## Project layout

```text
.github/workflows/deploy-pages.yml  GitHub Pages build/deploy workflow
render.yaml                         Optional API-only Render blueprint
Dockerfile                          API-only container
server.js                           Express API, cache, rate limits, CORS
shared/api-config.js                Public API/base-path normalization
shared/http-config.js               Exact-origin CORS helpers
shared/catalog.js                   Symbol catalogue & formatters
shared/indicators.js                Pure indicator + signal calculations
shared/trade-plan.js                Completed-bar buy/sell timing rules
shared/finnhub.js                   Optional server-side quote adapter + public guard
src/lib/api.js                      Central frontend API client
src/                                React UI (Vite)
test/                               Unit, HTTP and browser tests
worker/, wrangler.jsonc             Legacy Cloudflare port; not used by GitHub Pages
```

## Production checklist

- Verify backend health and both Indian/US data from the actual host.
- Replace/relicense Yahoo and Google News feeds as needed for public redistribution.
- Keep personal Finnhub keys out of public/shared deployments; rotate any exposed key.
- Use HTTPS, correct proxy-hop settings, monitoring, and authentication/abuse controls if needed.
- Add exchange holiday calendars and persistent watchlists if required.
- Obtain legal review for financial disclosures and data rights.

Deployment docs: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite static deployment](https://vite.dev/guide/static-deploy.html#github-pages), [Render blueprints](https://render.com/docs/blueprint-spec).
