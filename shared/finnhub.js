// Optional Finnhub quote adapter. The API key stays server-side.
// Free personal plans do not include historical candles; this adapter only
// enriches eligible US quotes and never rewrites Yahoo historical candles.
import { catalogEntry } from './catalog.js';

export const PROVIDER_ID = 'finnhub';
export const PROVIDER_LABEL = 'Finnhub';
const US_EXCHANGES = new Set(['Nasdaq', 'NasdaqGS', 'NasdaqGM', 'NasdaqCM', 'NYSE', 'NYSE American', 'NYSEArca', 'AMEX', 'BATS', 'NMS', 'NGM', 'NCM', 'NYQ', 'NYS', 'ASE', 'PCX', 'BTS']);

export function readProviderConfig(env = {}) {
  const apiKey = typeof env.FINNHUB_API_KEY === 'string' ? env.FINNHUB_API_KEY.trim() : '';
  const configured = apiKey.length > 0;
  const personalUseConfirmed = String(env.FINNHUB_PERSONAL_USE_CONFIRMED || '').toLowerCase() === 'true';
  // Fail closed for the public Pages + API deployment. A personal key must not
  // become a shared data feed just because someone sets the confirmation flag.
  const publicFlag = String(env.PUBLIC_DEPLOYMENT ?? '').trim().toLowerCase();
  const publicDeployment = publicFlag ? publicFlag === 'true' : String(env.NODE_ENV || '').toLowerCase() === 'production';
  return {
    provider: PROVIDER_ID,
    apiKey,
    configured,
    personalUseConfirmed,
    publicDeployment,
    enabled: configured && personalUseConfirmed && !publicDeployment,
    maxPerMinute: 40,
    cacheTtlMs: 45_000
  };
}

export function publicProviderStatus(config, client = null) {
  const runtime = client?.status?.() || {};
  return {
    provider: PROVIDER_ID,
    label: PROVIDER_LABEL,
    configured: Boolean(config.configured),
    personalUseConfirmed: Boolean(config.personalUseConfirmed),
    publicDeployment: Boolean(config.publicDeployment),
    enabled: Boolean(config.enabled),
    state: config.publicDeployment && config.configured ? 'public_deployment' : !config.configured ? 'not_configured' : !config.personalUseConfirmed ? 'confirmation_required' : runtime.lastError ? 'fallback' : 'ready',
    scope: 'Eligible US stock quotes only',
    fallback: 'Yahoo Finance',
    historySource: 'Yahoo Finance',
    signalSource: 'Yahoo Finance candles',
    newsSource: 'Google News RSS',
    license: 'Personal, non-commercial use only. Do not expose a personal key through a public or shared dashboard.',
    lastSuccessAt: runtime.lastSuccessAt || null,
    lastErrorCode: runtime.lastError || null,
    localBudgetRemaining: runtime.budgetRemaining ?? null
  };
}

export function eligibleForFinnhub(symbol, quote = null) {
  if (typeof symbol !== 'string' || !symbol || symbol.startsWith('^') || symbol.includes('.')) return false;
  if (!/^[A-Z][A-Z0-9-]{0,11}$/i.test(symbol)) return false;
  const entry = catalogEntry(symbol.toUpperCase());
  if (entry) return entry.market === 'US';
  if (quote?.market && quote.market !== 'US') return false;
  if (quote?.exchange && !US_EXCHANGES.has(quote.exchange)) return false;
  return true;
}

function finiteOrNull(v) { return Number.isFinite(v) ? v : null; }

export function normalizeFinnhubQuote(raw, symbol, baseQuote = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw providerError('invalid_response', 'Provider returned an invalid quote.');
  const price = Number(raw.c);
  const previousClose = Number(raw.pc);
  let marketTime = Number(raw.t);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(marketTime) || marketTime <= 0) {
    throw providerError('no_data', 'Provider has no usable quote for this symbol.');
  }
  if (marketTime > 1e12) marketTime = Math.floor(marketTime / 1000);
  const prev = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null;
  const change = Number.isFinite(raw.d) ? raw.d : prev != null ? price - prev : null;
  const changePercent = Number.isFinite(raw.dp) ? raw.dp : change != null && prev != null ? change / prev * 100 : null;
  return {
    symbol: symbol.toUpperCase(),
    name: baseQuote.name || catalogEntry(symbol.toUpperCase())?.name || symbol.toUpperCase(),
    market: 'US',
    currency: baseQuote.currency || 'USD',
    exchange: baseQuote.exchange || catalogEntry(symbol.toUpperCase())?.exchange || 'US',
    sector: baseQuote.sector || null,
    timezone: baseQuote.timezone || 'America/New_York',
    price,
    previousClose: prev,
    change,
    changePercent,
    dayHigh: finiteOrNull(raw.h),
    dayLow: finiteOrNull(raw.l),
    volume: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    marketTime: Math.floor(marketTime),
    regularPeriod: baseQuote.regularPeriod || null,
    sourceDelayMinutes: null,
    source: PROVIDER_LABEL,
    sourceUrl: null
  };
}

export function providerError(code, message) {
  const e = new Error(message);
  e.code = code;
  e.publicMessage = message;
  return e;
}

export function createFinnhubQuoteClient(config, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let calls = [];
  let cooldownUntil = 0;
  let lastError = null;
  let lastSuccessAt = null;
  let generation = 0;

  function budgetRemaining() {
    const t = now();
    calls = calls.filter(x => t - x < 60_000);
    return Math.max(0, (config.maxPerMinute || 40) - calls.length);
  }
  function status() {
    return { lastSuccessAt, lastError, budgetRemaining: budgetRemaining() };
  }
  function clear() {
    generation++;
    cache.clear();
    inflight.clear();
    calls = [];
    cooldownUntil = 0;
    lastError = null;
    lastSuccessAt = null;
  }
  async function getQuote(symbol, baseQuote = {}) {
    const sym = String(symbol || '').toUpperCase();
    if (!config.enabled) throw providerError('disabled', 'Provider is not enabled.');
    if (!eligibleForFinnhub(sym, baseQuote)) throw providerError('unsupported', 'Provider is used only for eligible US quotes.');
    const t = now();
    const hit = cache.get(sym);
    if (hit && t - hit.at < (config.cacheTtlMs || 45_000)) return hit.quote;
    if (inflight.has(sym)) return inflight.get(sym);
    if (t < cooldownUntil) throw providerError(lastError || 'cooldown', 'Provider is temporarily paused; using fallback data.');
    if (budgetRemaining() <= 0) throw providerError('budget', 'Local provider request budget reached; using fallback data.');

    const gen = generation;
    const p = (async () => {
      calls.push(now());
      const url = new URL('https://finnhub.io/api/v1/quote');
      url.searchParams.set('symbol', sym);
      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method: 'GET',
          headers: { 'X-Finnhub-Token': config.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
          // Never put the token in the URL, logs, browser responses, or edge cache.
          cache: 'no-store'
        });
      } catch {
        lastError = 'network';
        cooldownUntil = now() + 15_000;
        throw providerError('network', 'Provider network request failed; using fallback data.');
      }
      if (response.status === 401 || response.status === 403) {
        lastError = 'auth';
        cooldownUntil = now() + 300_000;
        throw providerError('auth', 'Provider rejected the key or entitlement; using fallback data.');
      }
      if (response.status === 429) {
        lastError = 'rate_limit';
        cooldownUntil = now() + 60_000;
        throw providerError('rate_limit', 'Provider rate limit reached; using fallback data.');
      }
      if (!response.ok) {
        lastError = 'upstream';
        cooldownUntil = now() + 30_000;
        throw providerError('upstream', 'Provider is temporarily unavailable; using fallback data.');
      }
      let raw;
      try { raw = await response.json(); } catch { throw providerError('invalid_response', 'Provider returned invalid JSON.'); }
      if (raw?.error) {
        lastError = 'entitlement';
        cooldownUntil = now() + 300_000;
        throw providerError('entitlement', 'Provider denied access to this endpoint; using fallback data.');
      }
      const quote = normalizeFinnhubQuote(raw, sym, baseQuote);
      if (gen === generation) {
        cache.set(sym, { at: now(), quote });
        lastSuccessAt = now();
        lastError = null;
      }
      return quote;
    })().finally(() => { if (gen === generation) inflight.delete(sym); });
    inflight.set(sym, p);
    return p;
  }
  return { getQuote, status, clear };
}

export function withHistorySource(result) {
  return { ...result, historySource: result.historySource || 'Yahoo Finance', signalSource: result.signalSource || 'Yahoo Finance candles' };
}

export function mergeProviderQuote(result, providerQuote) {
  return {
    ...withHistorySource(result),
    quote: providerQuote,
    quoteSource: PROVIDER_LABEL,
    providerWarning: null
  };
}

export function providerFallback(result, error) {
  return {
    ...withHistorySource(result),
    quoteSource: result.quote?.source || 'Yahoo Finance',
    providerWarning: error?.publicMessage || 'Provider quote unavailable; showing Yahoo Finance quote.',
    providerErrorCode: error?.code || 'upstream'
  };
}
