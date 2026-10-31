// Public frontend configuration. Never put provider credentials in this file.
export function normalizeApiBase(value, { required = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return {
    base: '', crossOrigin: false, configured: !required,
    error: required ? 'Set the API_BASE_URL repository variable to your running Node API URL, then rerun the GitHub Pages workflow.' : null
  };
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http:// or https:// API URL.');
    if (url.protocol === 'http:' && !local) throw new Error('A deployed dashboard needs an HTTPS API URL. HTTP is allowed only for localhost development.');
    if (url.username || url.password) throw new Error('Do not put credentials or API keys in the API URL.');
    if (url.search || url.hash) throw new Error('The API URL must not contain a query string or fragment.');
    let pathname = url.pathname.replace(/\/+$/, '');
    // Accept either the service origin or its /api endpoint, without doubling /api.
    if (pathname === '/api' || pathname.endsWith('/api')) pathname = pathname.slice(0, -4);
    return { base: url.origin + pathname, crossOrigin: true, configured: true, error: null };
  } catch (error) {
    return { base: '', crossOrigin: false, configured: false, error: error instanceof TypeError ? 'Enter a complete API URL, for example https://your-api.example.com.' : error.message };
  }
}

export function resolveApiUrl(path, config) {
  if (!config?.configured) throw new Error(config?.error || 'The API is not configured.');
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid API path.');
  return `${config.base || ''}${path}`;
}

export function normalizePagesBase(value, repository = '', owner = '') {
  if (value != null && String(value).trim()) {
    const raw = String(value).trim();
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\\?#]/.test(raw)) throw new Error('PAGES_BASE_PATH must be a site path such as /marketlens/ or /.');
    return raw.endsWith('/') ? raw : `${raw}/`;
  }
  if (!repository) return '/';
  if (repository.includes('/')) repository = repository.split('/').at(-1);
  if (owner && repository.toLowerCase() === `${owner}.github.io`.toLowerCase()) return '/';
  if (!/^[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository name for the GitHub Pages base path.');
  return `/${repository}/`;
}
