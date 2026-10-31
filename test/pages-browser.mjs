import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const pagesUrl = process.env.PAGES_URL || 'http://127.0.0.1:4173/marketlens/';
const apiUrl = (process.env.API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const staticOrigin = new URL(pagesUrl).origin;
const basePath = new URL(pagesUrl).pathname;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const apiRequests = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(String(err)));
page.on('request', req => { if (req.url().includes('/api/')) apiRequests.push(req.url()); });

try {
  await page.goto(pagesUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.price-chart canvas', { timeout: 30000 });
  await page.waitForTimeout(700);
  const overview = {
    title: await page.title(),
    price: await page.locator('.stock-price').textContent(),
    marketCards: await page.locator('.market-card').count(),
    chartCanvases: await page.locator('.price-chart canvas').count(),
    signals: await page.locator('.signal-card .verdict').allTextContents()
  };
  assert.equal(overview.marketCards, 4);
  assert.ok(overview.chartCanvases > 0);
  assert.ok(overview.price && !overview.price.includes('—'));
  assert.ok(apiRequests.length > 0);
  assert.ok(apiRequests.every(url => url.startsWith(`${apiUrl}/api/`)), 'Every API request must use the configured backend origin');
  assert.ok(!apiRequests.some(url => url.startsWith(`${staticOrigin}/api/`)), 'Static Pages host must not receive /api requests');
  const assetUrls = await page.evaluate(() => [...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map(el => el.src || el.href));
  assert.ok(assetUrls.every(url => new URL(url).pathname.startsWith(basePath)), 'Assets must use the project Pages base path');

  // Cross-origin search through the central API client.
  await page.keyboard.press('Control+k');
  await page.waitForSelector('dialog[open] input');
  await page.locator('dialog[open] input').fill('reliance');
  await page.waitForSelector('.search-result-main');
  await page.locator('.search-result-main').filter({ hasText: 'RELIANCE.NS' }).first().click();
  await page.waitForFunction(() => document.querySelector('.stock-meta')?.textContent.includes('RELIANCE.NS'));
  await page.waitForTimeout(1000);
  const selected = await page.locator('.stock-meta').textContent();

  // A JSON POST triggers a real browser CORS preflight against the Node API.
  const preflight = await page.evaluate(async url => {
    const r = await fetch(`${url}/api/provider/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { httpStatus: r.status, body: await r.json() };
  }, apiUrl);
  assert.equal(preflight.httpStatus, 200);
  assert.equal(preflight.body.ok, false);
  assert.equal(preflight.body.status.publicDeployment, true);
  assert.equal(preflight.body.status.enabled, false);

  await page.getByRole('button', { name: 'API connection' }).click();
  await page.waitForSelector('dialog[open]');
  const connectionTitle = await page.locator('dialog[open] h2').textContent();
  const secretInputs = await page.locator('dialog[open] input[type="password"], dialog[open] input[name*="key" i]').count();
  assert.equal(connectionTitle, 'API connection');
  assert.equal(secretInputs, 0);
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(mobileOverflow, false);

  // Optional second static build: GitHub Pages target with no API_BASE_URL.
  let unconfigured = null;
  const unconfiguredUrl = `${staticOrigin}/unconfigured/`;
  const head = await fetch(unconfiguredUrl, { method: 'HEAD' }).catch(() => null);
  if (head?.ok) {
    const before = apiRequests.length;
    await page.goto(unconfiguredUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.api-setup-banner');
    unconfigured = {
      banner: await page.locator('.api-setup-banner h2').textContent(),
      emptyMarketCards: await page.locator('.market-card-empty').count(),
      chartCanvases: await page.locator('.price-chart canvas').count(),
      apiRequests: apiRequests.length - before
    };
    assert.equal(unconfigured.banner, 'Connect your MarketLens API');
    assert.equal(unconfigured.emptyMarketCards, 4);
    assert.equal(unconfigured.chartCanvases, 0);
    assert.equal(unconfigured.apiRequests, 0);
    await page.keyboard.press('Control+k');
    await page.locator('dialog[open] input').fill('apple');
    await page.waitForSelector('.search-result-main');
    assert.match(await page.locator('.search-result-main').first().textContent(), /AAPL/);
  }

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pagesUrl, apiUrl, overview, selected, preflight: { httpStatus: preflight.httpStatus, publicGuard: preflight.body.status.state }, connectionTitle, secretInputs, mobileOverflow, unconfigured, apiRequestCount: apiRequests.length, consoleErrors: errors }, null, 2));
} finally {
  await browser.close();
}
