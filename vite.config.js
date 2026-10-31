import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizePagesBase } from './shared/api-config.js';

const githubPages = process.env.VITE_DEPLOY_TARGET === 'github-pages';
const base = githubPages
  ? normalizePagesBase(process.env.VITE_BASE_PATH, process.env.GITHUB_REPOSITORY, process.env.GITHUB_REPOSITORY_OWNER)
  : '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 }
});
