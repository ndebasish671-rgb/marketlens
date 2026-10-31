import { normalizeApiBase, resolveApiUrl } from '../../shared/api-config.js';

export const isGitHubPages = import.meta.env.VITE_DEPLOY_TARGET === 'github-pages';
export const apiConfig = normalizeApiBase(import.meta.env.VITE_API_BASE_URL, { required: isGitHubPages });
export const apiDisplayName = apiConfig.base || 'Same-origin API';

export async function apiRequest(path, { signal, method = 'GET' } = {}) {
  const url = resolveApiUrl(path, apiConfig);
  let response;
  try {
    response = await fetch(url, {
      method, signal,
      credentials: 'omit',
      mode: apiConfig.crossOrigin ? 'cors' : 'same-origin',
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the API. Check that the backend is running, its URL is correct, and it allows this website’s origin.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`The API URL returned a non-JSON response (${response.status}). Use the Node service URL, not the GitHub Pages website URL.`); }
  if (!response.ok) throw new Error(data?.error || `API request failed (${response.status}).`);
  return data;
}

export function getJSON(path, signal) { return apiRequest(path, { signal }); }
