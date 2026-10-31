import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 3107;
const base = `http://127.0.0.1:${port}`;
const pagesOrigin = 'https://owner.github.io';

test('Node API enforces exact CORS and the public personal-key guard', async t => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', CORS_ORIGINS: pagesOrigin, PUBLIC_DEPLOYMENT: 'true', TRUST_PROXY_HOPS: '0', FINNHUB_API_KEY: 'unit-test-not-a-real-key', FINNHUB_PERSONAL_USE_CONFIRMED: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`API startup timed out: ${logs}`)), 10000);
      child.stdout.on('data', () => { if (logs.includes('MarketLens listening')) { clearTimeout(timer); resolve(); } });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited early (${code}): ${logs}`)); });
    });

    await t.test('preflight allows the configured Pages origin and POST', async () => {
      const r = await fetch(`${base}/api/provider/test`, { method: 'OPTIONS', headers: { Origin: pagesOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,accept' } });
      assert.equal(r.status, 204);
      assert.equal(r.headers.get('access-control-allow-origin'), pagesOrigin);
      assert.match(r.headers.get('access-control-allow-methods'), /POST/);
      assert.equal(r.headers.get('access-control-allow-credentials'), null);
      assert.match(r.headers.get('vary'), /Origin/);
    });

    await t.test('allowed GET identifies the MarketLens API', async () => {
      const r = await fetch(`${base}/api/health`, { headers: { Origin: pagesOrigin } });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), pagesOrigin);
      const body = await r.json();
      assert.equal(body.service, 'marketlens-api');
      assert.equal(body.ok, true);
    });

    await t.test('unconfigured browser origin is rejected before upstream access', async () => {
      const r = await fetch(`${base}/api/analysis?symbol=AAPL`, { headers: { Origin: 'https://other.github.io' } });
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
      assert.match((await r.json()).error, /CORS_ORIGINS/);
    });

    await t.test('health checks without Origin still work', async () => {
      const r = await fetch(`${base}/api/health`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    });

    await t.test('public deployment disables a personal key even when confirmed', async () => {
      const r = await fetch(`${base}/api/provider/status`, { headers: { Origin: pagesOrigin } });
      const status = await r.json();
      assert.equal(status.configured, true);
      assert.equal(status.personalUseConfirmed, true);
      assert.equal(status.publicDeployment, true);
      assert.equal(status.enabled, false);
      assert.equal(status.state, 'public_deployment');
      assert.ok(!JSON.stringify(status).includes('unit-test-not-a-real-key'));
      const testResponse = await fetch(`${base}/api/provider/test`, { method: 'POST', headers: { Origin: pagesOrigin } });
      const result = await testResponse.json();
      assert.equal(result.ok, false);
      assert.match(result.error, /public deployments/);
    });
  } finally {
    if (child.exitCode == null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
});
