// Exact browser-origin allowlist for a separately hosted frontend.
// CORS is not authentication and does not make a public API private.
export function parseCorsOrigins(value = '') {
  const entries = String(value || '').split(',').map(x => x.trim()).filter(Boolean);
  if (entries.length > 12) throw new Error('CORS_ORIGINS supports at most 12 origins.');
  return [...new Set(entries.map(entry => {
    let url;
    try { url = new URL(entry); } catch { throw new Error('CORS_ORIGINS must contain complete origins, separated by commas.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || entry.endsWith('/')) {
      throw new Error('CORS_ORIGINS entries must be origins without a path or trailing slash, e.g. https://username.github.io.');
    }
    return url.origin;
  }))];
}

export function isSameRequestOrigin(origin, host) {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.host === host && url.origin === origin;
  } catch { return false; }
}

export function corsDecision(origin, host, allowedOrigins = []) {
  if (!origin) return { allowed: true, cors: false };
  const allowed = allowedOrigins.includes(origin) || isSameRequestOrigin(origin, host);
  return { allowed, cors: allowed };
}
