import express from 'express';
import rateLimit from 'express-rate-limit';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { STOCKS, INDICES, MARKET_SYMBOLS, catalogEntry, marketFor, displayName } from './shared/catalog.js';
import { swingSummary } from './shared/indicators.js';
import { buildTimingSet } from './shared/trade-plan.js';
import { parseCorsOrigins, corsDecision } from './shared/http-config.js';
import { readProviderConfig, publicProviderStatus, createFinnhubQuoteClient, eligibleForFinnhub, withHistorySource, mergeProviderQuote, providerFallback } from './shared/finnhub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local development only. Hosted backends inject environment variables/secrets.
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const app = express();
const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 3) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 3.');
if (trustProxyHops) app.set('trust proxy', trustProxyHops);
const PORT = Number(process.env.PORT || 3000);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// Exact-origin CORS for GitHub Pages. No cookies, credentials or wildcard origin.
// CORS controls browser reads; it is NOT authentication or a privacy boundary.
app.use('/api', (req, res, next) => {
  res.setHeader('Vary', 'Origin');
  const origin = req.get('origin');
  const decision = corsDecision(origin, req.get('host'), corsOrigins);
  if (!decision.allowed) return res.status(403).json({ error: 'This website origin is not allowed by the API. Check CORS_ORIGINS on the backend.' });
  if (decision.cors) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

// ---- Upstream cache + concurrency limiter ---------------------------------
const cache = new Map();
const inflight = new Map();
const TTL = { chart: 45_000, search: 300_000, news: 300_000 };
const STALE_MAX = 6 * 60 * 60_000;
let active = 0;
const queue = [];
function limit(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active++;
      try { resolve(await fn()); } catch (e) { reject(e); } finally { active--; dequeue(); }
    };
    queue.push(run);
    dequeue();
  });
}
function dequeue() { while (active < 3 && queue.length) queue.shift()(); }
function cached(key, ttl, producer) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttl) return Promise.resolve({ ...hit.data, stale: false, fetchedAt: hit.at });
  if (inflight.has(key)) return inflight.get(key);
  const p = limit(producer)
    .then(data => {
      cache.set(key, { at: Date.now(), data });
      if (cache.size > 600) for (const [k, v] of cache) if (Date.now() - v.at > STALE_MAX) cache.delete(k);
      return { ...data, stale: false, fetchedAt: Date.now() };
    })
    .catch(err => {
      if (hit && now - hit.at < STALE_MAX) return { ...hit.data, stale: true, fetchedAt: hit.at, warning: 'Upstream unavailable; showing cached data.' };
      throw err;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
async function fetchText(url, timeout = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, application/xml, text/xml, */*' }, signal: ctrl.signal });
    if (!r.ok) { const e = new Error(`Upstream HTTP ${r.status}`); e.status = r.status; throw e; }
    return await r.text();
  } finally { clearTimeout(t); }
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const SYMBOL_RE = /^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,23}$/;
function validSymbol(s) { return typeof s === 'string' && SYMBOL_RE.test(s); }

let providerClient = null;
let providerKey = null;
let providerEnabled = null;
function getProviderClient() {
  const config = readProviderConfig(process.env);
  if (!providerClient || providerKey !== config.apiKey || providerEnabled !== config.enabled) {
    providerClient?.clear?.();
    providerClient = createFinnhubQuoteClient(config);
    providerKey = config.apiKey;
    providerEnabled = config.enabled;
  }
  return { config, client: providerClient };
}
function providerStatus() {
  const { config, client } = getProviderClient();
  return publicProviderStatus(config, client);
}

// ---- Yahoo Finance chart normalization ------------------------------------
function exchangeDay(ts, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000)); }
  catch { return new Date(ts * 1000).toISOString().slice(0, 10); }
}
function normalizeChart(result, symbol, range, interval) {
  const meta = result.meta || {};
  const q = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  let candles = ts.map((time, i) => ({
    time, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i] ?? 0
  })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite) && c.close > 0);
  const tz = meta.exchangeTimezoneName || 'UTC';
  const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : candles.at(-1)?.close ?? null;
  const marketTime = Number.isFinite(meta.regularMarketTime) ? meta.regularMarketTime : candles.at(-1)?.time ?? null;
  // Keep the forming daily/intraday bar consistent with the latest regular-session quote.
  if (candles.length && price != null && marketTime != null && exchangeDay(marketTime, tz) === exchangeDay(candles.at(-1).time, tz)) {
    const c = candles.at(-1);
    c.close = price;
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    if (interval === '1d' && Number.isFinite(meta.regularMarketVolume)) c.volume = meta.regularMarketVolume;
  }
  let previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose : null;
  if (previousClose == null && candles.length >= 2 && marketTime != null) {
    const last = candles.at(-1);
    previousClose = exchangeDay(marketTime, tz) === exchangeDay(last.time, tz) ? candles.at(-2).close : last.close;
  }
  if (previousClose == null && Number.isFinite(meta.chartPreviousClose) && range === '1d') previousClose = meta.chartPreviousClose;
  const change = price != null && previousClose != null ? price - previousClose : null;
  const changePercent = change != null && previousClose > 0 ? change / previousClose * 100 : null;
  const entry = catalogEntry(symbol);
  const quote = {
    symbol,
    name: displayName(symbol, meta),
    market: entry?.market || marketFor(symbol, meta.exchangeName),
    currency: meta.currency || (symbol.endsWith('.NS') || symbol.endsWith('.BO') ? 'INR' : 'USD'),
    exchange: entry?.exchange || meta.fullExchangeName || meta.exchangeName || '—',
    sector: entry?.sector || null,
    timezone: tz,
    price, previousClose, change, changePercent,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    marketTime,
    regularPeriod: meta.currentTradingPeriod?.regular || null,
    sourceDelayMinutes: Number.isFinite(meta.exchangeDataDelayedBy) ? meta.exchangeDataDelayedBy : null,
    source: 'Yahoo Finance',
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
  return { quote, candles, range, interval };
}
async function fetchYahooChart(symbol, range, interval) {
  if (!validSymbol(symbol)) throw httpError(400, 'Invalid symbol.');
  const key = `chart:${symbol}:${range}:${interval}`;
  return cached(key, TTL.chart, async () => {
    const qs = new URLSearchParams({ range, interval, includePrePost: 'false', events: 'div,splits' });
    let lastErr;
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const text = await fetchText(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`);
        const json = JSON.parse(text);
        const result = json?.chart?.result?.[0];
        if (!result) throw httpError(502, json?.chart?.error?.description || 'No chart data returned.');
        return normalizeChart(result, symbol, range, interval);
      } catch (e) { lastErr = e; }
    }
    throw httpError(502, `Quote provider unavailable for ${symbol}. ${lastErr?.message || ''}`.trim());
  });
}

async function fetchChart(symbol, range, interval) {
  const base = await fetchYahooChart(symbol, range, interval);
  const { config, client } = getProviderClient();
  // Historical candles and signals stay on Yahoo. Finnhub free plans do not
  // include candles, and we do not mix IEX/consolidated quote feeds into bars.
  if (interval !== '1d' || !config.enabled || !eligibleForFinnhub(symbol, base.quote)) return withHistorySource(base);
  try {
    const quote = await client.getQuote(symbol, base.quote);
    return mergeProviderQuote(base, quote);
  } catch (e) {
    return providerFallback(base, e);
  }
}

// ---- Search ----------------------------------------------------------------
async function remoteSearch(q) {
  const key = `search:${q.toLowerCase()}`;
  return cached(key, TTL.search, async () => {
    const qs = new URLSearchParams({ q, quotesCount: '10', newsCount: '0', listsCount: '0' });
    let lastErr;
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const json = JSON.parse(await fetchText(`https://${host}/v1/finance/search?${qs}`));
        const items = (json.quotes || [])
          .filter(x => x.symbol && ['EQUITY', 'ETF'].includes(x.quoteType))
          .map(x => ({
            symbol: x.symbol,
            name: x.longname || x.shortname || x.symbol,
            market: marketFor(x.symbol, x.exchange),
            exchange: x.exchDisp || x.exchange || '—',
            sector: x.sectorDisp || x.sector || null,
            type: x.quoteType
          }))
          .filter(x => ['IN', 'US'].includes(x.market));
        return { items };
      } catch (e) { lastErr = e; }
    }
    throw httpError(502, `Search unavailable. ${lastErr?.message || ''}`.trim());
  });
}

// ---- Google News RSS (personal, non-commercial feed) -----------------------
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });
function stripHtml(s = '') { return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function safeLink(link) { try { const u = new URL(link); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
async function fetchNews({ symbol, topic }) {
  let query, region;
  const india = symbol ? /\.(NS|BO)$/i.test(symbol) || catalogEntry(symbol)?.market === 'IN' : topic === 'india';
  region = india ? 'IN' : 'US';
  if (symbol) {
    const name = catalogEntry(symbol)?.name || symbol.replace(/\.(NS|BO)$/i, '');
    query = `"${name}" stock`;
  } else {
    query = topic === 'india' ? 'Indian stock market NSE BSE' : topic === 'us' ? 'US stock market NYSE Nasdaq' : 'global stock markets';
  }
  const key = `news:${symbol || topic || 'global'}`;
  return cached(key, TTL.news, async () => {
    const qs = new URLSearchParams({ q: query, hl: india ? 'en-IN' : 'en-US', gl: region, ceid: `${region}:en` });
    const text = await fetchText(`https://news.google.com/rss/search?${qs}`);
    const parsed = xml.parse(text);
    const raw = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const seen = new Set();
    const items = arr.map(item => {
      const title = stripHtml(item.title);
      const link = safeLink(item.link);
      if (!title || !link) return null;
      const id = title.toLowerCase();
      if (seen.has(id)) return null;
      seen.add(id);
      const source = typeof item.source === 'object' ? item.source['#text'] : item.source;
      return {
        title, link,
        source: source || 'Google News',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        description: stripHtml(item.description || '').slice(0, 280)
      };
    }).filter(Boolean).slice(0, 12);
    return {
      items, query, region,
      source: 'Google News RSS',
      terms: 'Google News RSS is provided for personal, non-commercial feed-reader use. Commercial or public redistribution requires appropriate rights.',
      feedUrl: `https://news.google.com/rss/search?${qs}`
    };
  });
}

// ---- API routes ------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'marketlens-api', version: 2, features: { completedBarTiming: true, intradayMarketTiming: true }, time: new Date().toISOString(), sources: ['Yahoo Finance chart endpoint', 'Google News RSS'], provider: providerStatus() }));

app.get('/api/provider/status', (_req, res) => res.json(providerStatus()));
app.post('/api/provider/test', async (_req, res) => {
  const { config, client } = getProviderClient();
  if (!config.enabled) return res.json({ ok: false, error: config.publicDeployment ? 'Personal Finnhub keys are disabled on public deployments. Use an appropriately licensed server-side feed.' : 'Enable the server-side provider and personal-use confirmation first.', status: publicProviderStatus(config, client) });
  try {
    await client.getQuote('AAPL');
    res.json({ ok: true, status: publicProviderStatus(config, client) });
  } catch (e) {
    res.json({ ok: false, error: e.publicMessage || 'Provider test failed.', status: publicProviderStatus(config, client) });
  }
});

app.get('/api/analysis', async (req, res, next) => {
  try {
    const symbol = String(req.query.symbol || 'AAPL').toUpperCase();
    if (!validSymbol(symbol)) return res.status(400).json({ error: 'Invalid symbol.' });
    const [daily, intraday] = await Promise.allSettled([
      fetchChart(symbol, '1y', '1d'),
      fetchChart(symbol, '5d', '5m')
    ]);
    if (daily.status === 'rejected' && intraday.status === 'rejected') throw daily.reason;
    const warnings = [];
    if (daily.status === 'rejected') warnings.push(`Daily history unavailable: ${daily.reason.message}`);
    if (intraday.status === 'rejected') warnings.push(`Intraday history unavailable: ${intraday.reason.message}`);
    const d = daily.status === 'fulfilled' ? daily.value : null;
    const i = intraday.status === 'fulfilled' ? intraday.value : null;
    res.json({ symbol, quote: d?.quote || i?.quote || null, daily: d, intraday: i, warnings, provider: providerStatus(), providerWarning: d?.providerWarning || i?.providerWarning || null, fetchedAt: Date.now() });
  } catch (e) { next(e); }
});

app.get('/api/market', async (req, res, next) => {
  try {
    const requested = req.query.symbols ? String(req.query.symbols).split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : MARKET_SYMBOLS;
    if (requested.length > 24) return res.status(400).json({ error: 'At most 24 symbols per request.' });
    if (requested.some(s => !validSymbol(s))) return res.status(400).json({ error: 'Invalid symbol in list.' });
    const includeTiming = ['1', 'true', 'both'].includes(String(req.query.timing || '').toLowerCase());
    const results = await Promise.allSettled(requested.map(async symbol => {
      const isIndex = symbol.startsWith('^');
      const [daily, intraday] = await Promise.allSettled([
        fetchChart(symbol, '3mo', '1d'),
        includeTiming && !isIndex ? fetchChart(symbol, '5d', '5m') : Promise.resolve(null)
      ]);
      return { symbol, isIndex, daily, intraday };
    }));
    const items = [];
    const errors = [];
    results.forEach((r, idx) => {
      if (r.status !== 'fulfilled') { errors.push({ symbol: requested[idx], error: r.reason.message }); return; }
      const { symbol, isIndex, daily, intraday } = r.value;
      if (daily.status !== 'fulfilled') { errors.push({ symbol, error: daily.reason.message }); return; }
      const v = daily.value;
      const i = intraday.status === 'fulfilled' ? intraday.value : null;
      const quote = v.quote;
      const timing = includeTiming && !isIndex ? buildTimingSet({
        daily: v.candles, intraday: i?.candles || [], quote,
        dailyStale: v.stale, intradayStale: i?.stale ?? false,
        dailyFetchedAt: v.fetchedAt, intradayFetchedAt: i?.fetchedAt ?? null
      }) : null;
      items.push({
        ...quote, candles: v.candles, stale: v.stale, fetchedAt: v.fetchedAt,
        historySource: v.historySource, quoteSource: v.quoteSource,
        providerWarning: v.providerWarning || i?.providerWarning || null,
        swing: swingSummary(v.candles, quote.timezone),
        intradayBarTime: i?.candles?.at(-1)?.time ?? null,
        intradayFetchedAt: i?.fetchedAt ?? null,
        intradayStale: i?.stale ?? false,
        timing,
        timingWarning: includeTiming && !isIndex && intraday.status === 'rejected' ? 'Intraday timing unavailable; daily timing may still be shown.' : null
      });
    });
    res.json({ items, errors, timingIncluded: includeTiming, fetchedAt: Date.now() });
  } catch (e) { next(e); }
});

app.get('/api/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 1) return res.json({ items: [] });
    const needle = q.toLowerCase();
    const local = [...STOCKS, ...INDICES].filter(s => s.symbol.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)).map(s => ({ ...s, type: INDICES.includes(s) ? 'INDEX' : 'EQUITY' }));
    let remote = { items: [] };
    let warning = null;
    try { remote = await remoteSearch(q); } catch (e) { warning = 'Live search is temporarily unavailable; showing built-in matches.'; }
    const seen = new Set();
    const items = [...local, ...remote.items].filter(s => { if (seen.has(s.symbol)) return false; seen.add(s.symbol); return true; }).slice(0, 12);
    res.json({ items, warning });
  } catch (e) { next(e); }
});

app.get('/api/news', async (req, res, next) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
    if (symbol && !validSymbol(symbol)) return res.status(400).json({ error: 'Invalid symbol.' });
    const topic = ['india', 'us', 'global'].includes(req.query.topic) ? req.query.topic : 'global';
    res.json(await fetchNews({ symbol, topic }));
  } catch (e) { next(e); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
app.use((err, _req, res, _next) => {
  const status = err.status || 502;
  if (status >= 500) console.error('[api]', err.message);
  res.status(status).json({ error: status >= 500 ? 'Data provider is temporarily unavailable. Please retry shortly.' : err.message });
});

// ---- Static frontend -------------------------------------------------------
const dist = path.join(__dirname, 'dist');
app.use(express.static(dist, { maxAge: '1h', index: false }));
app.get('*', (_req, res) => {
  if (!existsSync(path.join(dist, 'index.html'))) return res.json({ ok: true, service: 'marketlens-api', message: 'MarketLens API is running. The frontend is hosted separately. Use /api/health to check this service.' });
  res.sendFile(path.join(dist, 'index.html'), err => {
    if (err && !res.headersSent) res.status(503).type('text').send('Frontend not built yet. Run: npm run build');
  });
});

app.listen(PORT, '0.0.0.0', () => console.log(`MarketLens listening on http://0.0.0.0:${PORT}`));
