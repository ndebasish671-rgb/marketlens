import { normalizeApiBase } from '../shared/api-config.js';

const config = normalizeApiBase(process.env.API_BASE_URL, { required: true });
if (!config.configured) {
  console.error(`GitHub Pages setup incomplete: ${config.error}`);
  console.error('GitHub → repository Settings → Secrets and variables → Actions → Variables → New repository variable.');
  console.error('Name: API_BASE_URL. Value: the HTTPS origin of your running Node API (not a provider API key).');
  process.exit(1);
}
console.log(`GitHub Pages will use the public API origin: ${config.base}`);
