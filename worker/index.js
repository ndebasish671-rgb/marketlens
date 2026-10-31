import { STOCKS, INDICES, MARKET_SYMBOLS, catalogEntry, marketFor, displayName } from '../shared/catalog.js';
import { swingSummary } from '../shared/indicators.js';
import { XMLParser } from 'fast-xml-parser';
import { readProviderConfig, publicProviderStatus, createFinnhubQuoteClient, eligibleForFinnhub, withHistorySource, mergeProviderQuote, providerFallback } from '../shared/finnhub.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TTL = { chart: 45, search: 300, news: 300 };
const SYMBOL_RE = /^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,23}$/;
const validSymbol = s => typeof s === 'string' && SYMBOL_RE.test(s);
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });

let providerClient = null;
let providerKey = null;
let providerEnabled = null;
function getProviderClient(env = {}) {
  const config = readProviderConfig(env);
  if (!providerClient || providerKey !== config.apiKey || providerEnabled !== config.enabled) {
    providerClient?.clear?.();
    providerClient = createFinnhubQuoteClient(config);
    providerKey = config.apiKey;
    providerEnabled = config.enabled;
  }
  return { config, client: providerClient };
}
function providerStatus(env) {
  const { config, client } = getProviderClient(env);
  return publicProviderStatus(config, client);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders }
  });
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
async function fetchText(url, timeout = 12000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(timeout), cf: { cacheTtl: 0, cacheEverything: false } });
  if (!r.ok) { const e = new Error(`Upstream HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.text();
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}
async function cachedJson(key, ttlSeconds, producer, ctx) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://cache.marketlens.internal/${encodeURIComponent(key)}`);
  if (cache) {
    try { const hit = await cache.match(cacheKey); if (hit) return await hit.json(); } catch {}
  }
  const data = await producer();
  const body = { ...data, fetchedAt: Date.now(), stale: false };
  if (cache) {
    const res = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttlSeconds}` } });
    try { const p = cache.put(cacheKey, res); if (ctx?.waitUntil) ctx.waitUntil(p); else await p; } catch {}
  }
  return body;
}
function exchangeDay(ts, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000)); }
  catch { return new Date(ts * 1000).toISOString().slice(0, 10); }
}
function normalizeChart(result, symbol, range, interval) {
  const meta = result.meta || {};
  const q = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  let candles = ts.map((time, i) => ({ time, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i] ?? 0 }))
    .filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite) && c.close > 0);
  const tz = meta.exchangeTimezoneName || 'UTC';
  const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : candles.at(-1)?.close ?? null;
  const marketTime = Number.isFinite(meta.regularMarketTime) ? meta.regularMarketTime : candles.at(-1)?.time ?? null;
  if (candles.length && price != null && marketTime != null && exchangeDay(marketTime, tz) === exchangeDay(candles.at(-1).time, tz)) {
    const c = candles.at(-1);
    c.close = price; c.high = Math.max(c.high, price); c.low = Math.min(c.low, price);
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
    symbol, name: displayName(symbol, meta), market: entry?.market || marketFor(symbol, meta.exchangeName),
    currency: meta.currency || (symbol.endsWith('.NS') || symbol.endsWith('.BO') ? 'INR' : 'USD'),
    exchange: entry?.exchange || meta.fullExchangeName || meta.exchangeName || '—', sector: entry?.sector || null,
    timezone: tz, price, previousClose, change, changePercent,
    dayHigh: meta.regularMarketDayHigh ?? null, dayLow: meta.regularMarketDayLow ?? null, volume: meta.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null, fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    marketTime, regularPeriod: meta.currentTradingPeriod?.regular || null,
    sourceDelayMinutes: Number.isFinite(meta.exchangeDataDelayedBy) ? meta.exchangeDataDelayedBy : null,
    source: 'Yahoo Finance', sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
  return { quote, candles, range, interval };
}
async function fetchYahooChart(symbol, range, interval, ctx) {
  if (!validSymbol(symbol)) throw httpError(400, 'Invalid symbol.');
  return cachedJson(`chart:${symbol}:${range}:${interval}`, TTL.chart, async () => {
    const qs = new URLSearchParams({ range, interval, includePrePost: 'false', events: 'div,splits' });
    let lastErr;
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const result = JSON.parse(await fetchText(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`))?.chart?.result?.[0];
        if (!result) throw httpError(502, 'No chart data returned.');
        return normalizeChart(result, symbol, range, interval);
      } catch (e) { lastErr = e; }
    }
    throw httpError(502, `Quote provider unavailable for ${symbol}. ${lastErr?.message || ''}`.trim());
  }, ctx);
}
async function fetchChart(symbol, range, interval, ctx, env) {
  const base = await fetchYahooChart(symbol, range, interval, ctx);
  const { config, client } = getProviderClient(env);
  // Keep historical candles/signals on Yahoo. The optional keyed feed supplies
  // eligible US quotes only; free Finnhub plans do not include candles.
  if (interval !== '1d' || !config.enabled || !eligibleForFinnhub(symbol, base.quote)) return withHistorySource(base);
  try {
    const quote = await client.getQuote(symbol, base.quote);
    return mergeProviderQuote(base, quote);
  } catch (e) {
    return providerFallback(base, e);
  }
}
async function remoteSearch(q, ctx) {
  return cachedJson(`search:${q.toLowerCase()}`, TTL.search, async () => {
    const qs = new URLSearchParams({ q, quotesCount: '10', newsCount: '0', listsCount: '0' });
    let lastErr;
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const j = JSON.parse(await fetchText(`https://${host}/v1/finance/search?${qs}`));
        const items = (j.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF'].includes(x.quoteType))
          .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, market: marketFor(x.symbol, x.exchange), exchange: x.exchDisp || x.exchange || '—', sector: x.sectorDisp || x.sector || null, type: x.quoteType }))
          .filter(x => ['IN', 'US'].includes(x.market));
        return { items };
      } catch (e) { lastErr = e; }
    }
    throw httpError(502, `Search unavailable. ${lastErr?.message || ''}`.trim());
  }, ctx);
}
function stripHtml(s = '') { return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function safeLink(link) { try { const u = new URL(link); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
async function fetchNews({ symbol, topic }, ctx) {
  const india = symbol ? /\.(NS|BO)$/i.test(symbol) || catalogEntry(symbol)?.market === 'IN' : topic === 'india';
  const region = india ? 'IN' : 'US';
  let query;
  if (symbol) query = `"${catalogEntry(symbol)?.name || symbol.replace(/\.(NS|BO)$/i, '')}" stock`;
  else query = topic === 'india' ? 'Indian stock market NSE BSE' : topic === 'us' ? 'US stock market NYSE Nasdaq' : 'global stock markets';
  return cachedJson(`news:${symbol || topic || 'global'}`, TTL.news, async () => {
    const qs = new URLSearchParams({ q: query, hl: india ? 'en-IN' : 'en-US', gl: region, ceid: `${region}:en` });
    const parsed = xml.parse(await fetchText(`https://news.google.com/rss/search?${qs}`));
    const raw = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const seen = new Set();
    const items = arr.map(item => {
      const title = stripHtml(item.title); const link = safeLink(item.link);
      if (!title || !link || seen.has(title.toLowerCase())) return null;
      seen.add(title.toLowerCase());
      const source = typeof item.source === 'object' ? item.source['#text'] : item.source;
      return { title, link, source: source || 'Google News', publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null, description: stripHtml(item.description || '').slice(0, 280) };
    }).filter(Boolean).slice(0, 12);
    return { items, query, region, source: 'Google News RSS', terms: 'Google News RSS is provided for personal, non-commercial feed-reader use. Commercial or public redistribution requires appropriate rights.', feedUrl: `https://news.google.com/rss/search?${qs}` };
  }, ctx);
}
async function optionalRateLimit(request, env) {
  if (!env.RL) return null;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
    const count = Number(await env.RL.get(key) || 0) + 1;
    await env.RL.put(key, String(count), { expirationTtl: 120 });
    if (count > 300) return json({ error: 'Rate limit exceeded. Try again shortly.' }, 429);
  } catch {}
  return null;
}
async function handleApi(request, url, env, ctx) {
  const limited = await optionalRateLimit(request, env);
  if (limited) return limited;
  const path = url.pathname;
  try {
    if (path === '/api/health') return json({ ok: true, time: new Date().toISOString(), runtime: 'cloudflare-worker', sources: ['Yahoo Finance chart endpoint', 'Google News RSS'], provider: providerStatus(env) });
    if (path === '/api/provider/status') return json(providerStatus(env));
    if (path === '/api/provider/test') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      const { config, client } = getProviderClient(env);
      if (!config.enabled) return json({ ok: false, status: publicProviderStatus(config, client) });
      try {
        await client.getQuote('AAPL');
        return json({ ok: true, status: publicProviderStatus(config, client) });
      } catch (e) {
        return json({ ok: false, error: e.publicMessage || 'Provider test failed.', status: publicProviderStatus(config, client) });
      }
    }
    if (path === '/api/analysis') {
      const symbol = String(url.searchParams.get('symbol') || 'AAPL').toUpperCase();
      if (!validSymbol(symbol)) return json({ error: 'Invalid symbol.' }, 400);
      const [daily, intraday] = await Promise.allSettled([fetchChart(symbol, '1y', '1d', ctx, env), fetchChart(symbol, '5d', '5m', ctx, env)]);
      if (daily.status === 'rejected' && intraday.status === 'rejected') throw daily.reason;
      const warnings = [];
      if (daily.status === 'rejected') warnings.push(`Daily history unavailable: ${daily.reason.message}`);
      if (intraday.status === 'rejected') warnings.push(`Intraday history unavailable: ${intraday.reason.message}`);
      const d = daily.status === 'fulfilled' ? daily.value : null;
      const i = intraday.status === 'fulfilled' ? intraday.value : null;
      return json({ symbol, quote: d?.quote || i?.quote || null, daily: d, intraday: i, warnings, provider: providerStatus(env), providerWarning: d?.providerWarning || i?.providerWarning || null, fetchedAt: Date.now() });
    }
    if (path === '/api/market') {
      const requested = url.searchParams.get('symbols') ? String(url.searchParams.get('symbols')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : MARKET_SYMBOLS;
      if (requested.length > 24) return json({ error: 'At most 24 symbols per request.' }, 400);
      if (requested.some(s => !validSymbol(s))) return json({ error: 'Invalid symbol in list.' }, 400);
      const results = await mapLimit(requested, 3, s => fetchChart(s, '3mo', '1d', ctx, env).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })));
      const items = []; const errors = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') { const v = r.value; items.push({ ...v.quote, candles: v.candles, stale: v.stale, fetchedAt: v.fetchedAt, historySource: v.historySource, quoteSource: v.quoteSource, providerWarning: v.providerWarning || null, swing: swingSummary(v.candles, v.quote.timezone) }); }
        else errors.push({ symbol: requested[idx], error: r.reason.message });
      });
      return json({ items, errors, fetchedAt: Date.now() });
    }
    if (path === '/api/search') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
      if (!q) return json({ items: [] });
      const needle = q.toLowerCase();
      const local = [...STOCKS, ...INDICES].filter(s => s.symbol.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)).map(s => ({ ...s, type: INDICES.includes(s) ? 'INDEX' : 'EQUITY' }));
      let remote = { items: [] }; let warning = null;
      try { remote = await remoteSearch(q, ctx); } catch { warning = 'Live search is temporarily unavailable; showing built-in matches.'; }
      const seen = new Set();
      const items = [...local, ...remote.items].filter(s => { if (seen.has(s.symbol)) return false; seen.add(s.symbol); return true; }).slice(0, 12);
      return json({ items, warning });
    }
    if (path === '/api/news') {
      const symbol = url.searchParams.get('symbol') ? String(url.searchParams.get('symbol')).toUpperCase() : null;
      if (symbol && !validSymbol(symbol)) return json({ error: 'Invalid symbol.' }, 400);
      const topic = ['india', 'us', 'global'].includes(url.searchParams.get('topic')) ? url.searchParams.get('topic') : 'global';
      return json(await fetchNews({ symbol, topic }, ctx));
    }
    return json({ error: 'Unknown API route.' }, 404);
  } catch (e) {
    const status = e.status || 502;
    return json({ error: status >= 500 ? 'Data provider is temporarily unavailable. Please retry shortly.' : e.message }, status);
  }
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, url, env, ctx);
    return env.ASSETS.fetch(request);
  }
};
