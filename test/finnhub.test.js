import test from 'node:test';
import assert from 'node:assert/strict';
import { readProviderConfig, publicProviderStatus, createFinnhubQuoteClient, eligibleForFinnhub, normalizeFinnhubQuote, mergeProviderQuote } from '../shared/finnhub.js';

const rawQuote = { c: 344.63, d: -4.28, dp: -1.227, h: 349.19, l: 342.35, o: 346.72, pc: 348.91, t: 1793390401 };
const baseQuote = { symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD', exchange: 'Nasdaq', timezone: 'America/New_York', market: 'US' };
const okResponse = () => new Response(JSON.stringify(rawQuote), { status: 200, headers: { 'content-type': 'application/json' } });

test('provider config requires key and explicit personal-use confirmation', () => {
  assert.equal(readProviderConfig({}).enabled, false);
  assert.equal(readProviderConfig({ FINNHUB_API_KEY: 'secret' }).enabled, false);
  assert.equal(readProviderConfig({ FINNHUB_API_KEY: 'secret', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' }).enabled, true);
});

test('public deployment blocks a confirmed personal key and never calls the provider', async () => {
  const config = readProviderConfig({ FINNHUB_API_KEY: 'personal-secret', FINNHUB_PERSONAL_USE_CONFIRMED: 'true', PUBLIC_DEPLOYMENT: 'true' });
  assert.equal(config.enabled, false);
  const status = publicProviderStatus(config);
  assert.equal(status.state, 'public_deployment');
  assert.equal(status.publicDeployment, true);
  assert.ok(!JSON.stringify(status).includes('personal-secret'));
  let calls = 0;
  const client = createFinnhubQuoteClient(config, { fetchImpl: async () => { calls++; return okResponse(); } });
  await assert.rejects(client.getQuote('AAPL', baseQuote));
  assert.equal(calls, 0);
});

test('production defaults to the public guard unless explicitly marked private', () => {
  const env = { FINNHUB_API_KEY: 'personal-secret', FINNHUB_PERSONAL_USE_CONFIRMED: 'true', NODE_ENV: 'production' };
  assert.equal(readProviderConfig(env).enabled, false);
  assert.equal(readProviderConfig({ ...env, PUBLIC_DEPLOYMENT: 'false' }).enabled, true);
  assert.equal(readProviderConfig({ ...env, PUBLIC_DEPLOYMENT: 'true' }).enabled, false);
});

test('public status never exposes the API key', () => {
  const config = readProviderConfig({ FINNHUB_API_KEY: 'super-secret-value', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' });
  const status = publicProviderStatus(config);
  const serialized = JSON.stringify(status);
  assert.equal(status.configured, true);
  assert.equal(status.enabled, true);
  assert.ok(!serialized.includes('super-secret-value'));
  assert.ok(!('apiKey' in status));
});

test('eligibility excludes Indian suffixes and indices', () => {
  assert.equal(eligibleForFinnhub('AAPL'), true);
  assert.equal(eligibleForFinnhub('RELIANCE.NS'), false);
  assert.equal(eligibleForFinnhub('INFY.BO'), false);
  assert.equal(eligibleForFinnhub('^GSPC'), false);
  assert.equal(eligibleForFinnhub('UNKNOWN', { market: 'IN', exchange: 'NSE' }), false);
});

test('normalizes Finnhub quote without claiming a guaranteed delay', () => {
  const q = normalizeFinnhubQuote(rawQuote, 'AAPL', baseQuote);
  assert.equal(q.source, 'Finnhub');
  assert.equal(q.price, 344.63);
  assert.equal(q.previousClose, 348.91);
  assert.equal(q.marketTime, 1793390401);
  assert.equal(q.sourceDelayMinutes, null);
  assert.equal(q.currency, 'USD');
});

test('zero/empty provider quote is rejected instead of shown as a real price', () => {
  assert.throws(() => normalizeFinnhubQuote({ c: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }, 'AAPL'), /no usable quote/);
});

test('client sends key in header, not URL, and caches/dedupes successful quotes', async () => {
  let calls = 0;
  let seenUrl = '';
  let seenHeader = '';
  const config = readProviderConfig({ FINNHUB_API_KEY: 'header-secret', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' });
  const client = createFinnhubQuoteClient(config, { fetchImpl: async (url, opts) => { calls++; seenUrl = url; seenHeader = opts.headers['X-Finnhub-Token']; return okResponse(); } });
  const [a, b] = await Promise.all([client.getQuote('AAPL', baseQuote), client.getQuote('AAPL', baseQuote)]);
  const c = await client.getQuote('AAPL', baseQuote);
  assert.equal(calls, 1);
  assert.equal(a.price, b.price);
  assert.equal(c.price, 344.63);
  assert.ok(!seenUrl.includes('header-secret'));
  assert.ok(!seenUrl.includes('token='));
  assert.equal(seenHeader, 'header-secret');
});

test('auth failure is sanitized and pauses repeated keyed requests', async () => {
  let calls = 0;
  const config = readProviderConfig({ FINNHUB_API_KEY: 'bad-secret', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' });
  const client = createFinnhubQuoteClient(config, { fetchImpl: async () => { calls++; return new Response(JSON.stringify({ error: 'Invalid API key bad-secret' }), { status: 401 }); } });
  await assert.rejects(client.getQuote('AAPL', baseQuote), e => e.code === 'auth' && !e.message.includes('bad-secret'));
  await assert.rejects(client.getQuote('AAPL', baseQuote), e => e.code === 'auth');
  assert.equal(calls, 1);
  assert.equal(client.status().lastError, 'auth');
});

test('local request budget prevents exhausting the free minute allowance', async () => {
  let calls = 0;
  let t = 100000;
  const config = { ...readProviderConfig({ FINNHUB_API_KEY: 'x', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' }), maxPerMinute: 2, cacheTtlMs: 0 };
  const client = createFinnhubQuoteClient(config, { now: () => t, fetchImpl: async () => { calls++; return okResponse(); } });
  await client.getQuote('AAPL', baseQuote);
  await client.getQuote('MSFT', baseQuote);
  await assert.rejects(client.getQuote('NVDA', baseQuote), e => e.code === 'budget');
  assert.equal(calls, 2);
  t += 60001;
  await client.getQuote('NVDA', baseQuote);
  assert.equal(calls, 3);
});

test('merging a provider quote never rewrites historical candles or signal source', () => {
  const candles = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];
  const result = { quote: { ...baseQuote, source: 'Yahoo Finance', price: 1 }, candles, historySource: 'Yahoo Finance' };
  const providerQuote = normalizeFinnhubQuote(rawQuote, 'AAPL', baseQuote);
  const merged = mergeProviderQuote(result, providerQuote);
  assert.equal(merged.quote.source, 'Finnhub');
  assert.equal(merged.historySource, 'Yahoo Finance');
  assert.equal(merged.signalSource, 'Yahoo Finance candles');
  assert.deepEqual(merged.candles, candles);
});
