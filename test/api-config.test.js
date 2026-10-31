import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiBase, resolveApiUrl, normalizePagesBase } from '../shared/api-config.js';

test('same-origin API remains the default for local/all-in-one hosting', () => {
  const config = normalizeApiBase('');
  assert.equal(config.configured, true);
  assert.equal(config.crossOrigin, false);
  assert.equal(resolveApiUrl('/api/health', config), '/api/health');
});

test('GitHub Pages fails closed when the backend URL is missing', () => {
  const config = normalizeApiBase('', { required: true });
  assert.equal(config.configured, false);
  assert.match(config.error, /API_BASE_URL/);
  assert.throws(() => resolveApiUrl('/api/analysis', config), /API_BASE_URL/);
});

test('HTTPS API origin is normalized and used for every API path', () => {
  const config = normalizeApiBase('https://api.example.com/');
  assert.equal(config.base, 'https://api.example.com');
  assert.equal(config.crossOrigin, true);
  assert.equal(resolveApiUrl('/api/analysis?symbol=AAPL', config), 'https://api.example.com/api/analysis?symbol=AAPL');
});

test('an accidental /api suffix does not produce /api/api', () => {
  assert.equal(normalizeApiBase('https://api.example.com/api').base, 'https://api.example.com');
  assert.equal(normalizeApiBase('https://api.example.com/backend/api/').base, 'https://api.example.com/backend');
});

test('localhost HTTP is allowed for development', () => {
  for (const base of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal(normalizeApiBase(base, { required: true }).configured, true);
  }
});

test('deployed API rejects insecure HTTP and credential-bearing URLs', () => {
  assert.match(normalizeApiBase('http://api.example.com', { required: true }).error, /HTTPS/);
  assert.match(normalizeApiBase('https://user:secret@api.example.com').error, /credentials/);
  assert.match(normalizeApiBase('https://api.example.com?token=secret').error, /query string/);
  assert.match(normalizeApiBase('https://api.example.com#key').error, /fragment/);
  assert.equal(normalizeApiBase('not a url').configured, false);
  assert.equal(normalizeApiBase('ftp://api.example.com').configured, false);
});

test('API URL builder rejects non-API and protocol-relative paths', () => {
  const config = normalizeApiBase('https://api.example.com');
  assert.throws(() => resolveApiUrl('//evil.example/api/health', config), /Invalid API path/);
  assert.throws(() => resolveApiUrl('https://evil.example/api/health', config), /Invalid API path/);
  assert.throws(() => resolveApiUrl('/health', config), /Invalid API path/);
});

test('project Pages base is derived from the repository name', () => {
  assert.equal(normalizePagesBase('', 'octocat/marketlens', 'octocat'), '/marketlens/');
  assert.equal(normalizePagesBase(undefined, 'marketlens'), '/marketlens/');
});

test('user-root Pages and explicit custom-domain base use /', () => {
  assert.equal(normalizePagesBase('', 'octocat/octocat.github.io', 'octocat'), '/');
  assert.equal(normalizePagesBase('/', 'octocat/marketlens', 'octocat'), '/');
  assert.equal(normalizePagesBase('/research', 'octocat/marketlens'), '/research/');
});

test('invalid Pages base paths are rejected', () => {
  assert.throws(() => normalizePagesBase('https://example.com/'), /site path/);
  assert.throws(() => normalizePagesBase('//example.com/'), /site path/);
  assert.throws(() => normalizePagesBase('/marketlens?x=1'), /site path/);
});
