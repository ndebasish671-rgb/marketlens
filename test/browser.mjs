import { chromium } from 'playwright';
import fs from 'node:fs';

const base = 'http://127.0.0.1:3000';
fs.mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(String(err)));

await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.price-chart canvas', { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'screenshots/desktop-overview.png', fullPage: true });
const overview = {
  title: await page.title(),
  h1: await page.locator('h1').textContent(),
  price: await page.locator('.stock-price').textContent(),
  signals: await page.locator('.signal-card .verdict').allTextContents(),
  marketCards: await page.locator('.market-card').count(),
  chartCanvases: await page.locator('.price-chart canvas').count(),
  newsItems: await page.locator('.news-preview .news-item').count()
};

// Swing view + MACD
await page.getByRole('button', { name: 'Swing', exact: true }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'MACD (12,26,9)', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/desktop-swing-macd.png', fullPage: true });

// Reasoning modal
await page.getByRole('button', { name: 'See full reasoning' }).first().click();
await page.waitForSelector('dialog[open]');
const modalTitle = await page.locator('dialog[open] h2').textContent();
await page.screenshot({ path: 'screenshots/signal-reasoning.png' });
await page.getByRole('button', { name: 'Close dialog' }).click();

// Search and select an Indian stock
await page.keyboard.press('Control+k');
await page.waitForSelector('dialog[open] input');
await page.locator('dialog[open] input').fill('infosys');
await page.waitForTimeout(900);
const searchCount = await page.locator('.search-result').count();
await page.locator('.search-result-main').filter({ hasText: 'INFY.NS' }).first().click();
await page.waitForTimeout(1500);
const selected = await page.locator('.stock-meta').textContent();

// Screener
await page.getByRole('button', { name: 'Market screener' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'India', exact: true }).click();
await page.waitForTimeout(300);
const screenerRows = await page.locator('.stock-table tbody tr').count();
await page.screenshot({ path: 'screenshots/screener.png', fullPage: true });

// API connection modal (no secret input should exist)
await page.getByRole('button', { name: 'API connection' }).click();
await page.waitForSelector('dialog[open]');
const connectionTitle = await page.locator('dialog[open] h2').textContent();
const secretInputs = await page.locator('dialog[open] input[type="password"], dialog[open] input[name*="key" i]').count();
await page.screenshot({ path: 'screenshots/api-connection.png' });
await page.getByRole('button', { name: 'Close dialog' }).click();

// News page
await page.getByRole('button', { name: 'Market news' }).click();
await page.waitForTimeout(1200);
const newsCards = await page.locator('.news-card').count();

// Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Toggle navigation' }).click();
await page.getByRole('button', { name: 'Overview' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'screenshots/mobile-overview.png', fullPage: true });
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

console.log(JSON.stringify({ overview, modalTitle, connectionTitle, secretInputs, searchCount, selected, screenerRows, newsCards, mobileOverflow, consoleErrors: errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
