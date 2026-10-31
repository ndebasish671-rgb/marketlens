import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsOrigins, corsDecision, isSameRequestOrigin } from '../shared/http-config.js';

test('CORS origins are exact, deduplicated and path-free', () => {
  assert.deepEqual(parseCorsOrigins('https://owner.github.io, https://stocks.example.com,https://owner.github.io'), ['https://owner.github.io', 'https://stocks.example.com']);
});

test('CORS configuration rejects paths, trailing slashes, wildcards and credentials', () => {
  for (const value of ['https://owner.github.io/marketlens/', 'https://owner.github.io/', '*', 'null', 'https://user:pass@owner.github.io', 'https://owner.github.io?x=1']) {
    assert.throws(() => parseCorsOrigins(value));
  }
});

test('configured Pages origin is allowed without credentials', () => {
  const allowed = parseCorsOrigins('https://owner.github.io');
  assert.deepEqual(corsDecision('https://owner.github.io', 'api.example.com', allowed), { allowed: true, cors: true });
});

test('unconfigured, lookalike and null origins are rejected', () => {
  const allowed = parseCorsOrigins('https://owner.github.io');
  for (const origin of ['https://other.github.io', 'https://owner.github.io.evil.example', 'http://owner.github.io', 'null']) {
    assert.equal(corsDecision(origin, 'api.example.com', allowed).allowed, false);
  }
});

test('same-origin frontend keeps working without an allowlist', () => {
  assert.equal(corsDecision('http://localhost:3000', 'localhost:3000', []).cors, true);
  assert.equal(corsDecision('https://preview.example.com', 'preview.example.com', []).cors, true);
  assert.equal(isSameRequestOrigin('https://evil.example', 'preview.example.com'), false);
});

test('non-browser requests without Origin are not blocked by CORS', () => {
  assert.deepEqual(corsDecision(undefined, 'api.example.com', []), { allowed: true, cors: false });
});

test('empty CORS configuration is valid for an all-in-one deployment', () => {
  assert.deepEqual(parseCorsOrigins(''), []);
  assert.deepEqual(parseCorsOrigins(undefined), []);
});

test('CORS allowlist is bounded', () => {
  assert.throws(() => parseCorsOrigins(Array.from({ length: 13 }, (_, i) => `https://site${i}.example.com`).join(',')), /at most 12/);
});
