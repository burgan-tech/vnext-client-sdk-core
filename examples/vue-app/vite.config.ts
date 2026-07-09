import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The SDK workspace packages are consumed as pre-built `dist/` ESM via npm
// workspace symlinks. Exclude them from Vite's dep pre-bundling so a rebuild of
// any SDK is picked up on reload, and dedupe vue/primevue so PseudoView's
// provide/inject sees a single Vue + PrimeVue instance.
const SDK_PACKAGES = [
  '@morph/core',
  '@morph/oauth2',
  '@morph/logger',
  '@morph/browser-storage',
  '@burgan-tech/pseudo-ui',
  '@burgan-tech/pseudo-ui/vue',
  '@burgantech/context-store',
  'page-router',
  'page-router-vue',
  'amorphie-workflow-manager',
  'amorphie-workflow-manager-vue',
];

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'primevue'],
  },
  optimizeDeps: {
    exclude: SDK_PACKAGES,
  },
  build: {
    // page-router's createPageRouter is async and main.ts uses top-level await.
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      // Real morph-idm workflow backend (test env). The browser calls
      // same-origin `/api/v1/...` (so no CORS — the real API sends none) and
      // Vite forwards to the backend. MSW handles `/api/accounts` before this.
      '/api/v1': {
        target: 'https://test-vnext-morph-idm.apps.nonprod.ebt.bank',
        changeOrigin: true,
        // The test backend serves a self-signed cert not in Node's CA bundle.
        secure: false,
      },
    },
  },
});
