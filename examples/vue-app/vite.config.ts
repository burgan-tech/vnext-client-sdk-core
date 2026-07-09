import { fileURLToPath } from 'node:url';
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
  '@burgan-tech/app-host',
];

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'primevue'],
    alias: {
      // Consume app-host straight from source (no build step needed in dev).
      '@burgan-tech/app-host': fileURLToPath(
        new URL('../../packages/app-host/src/index.ts', import.meta.url),
      ),
    },
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
      // Local shell domain backend (vnext-configuration, domain "shell").
      // Browser calls same-origin `/shell/functions/...`; Vite rewrites to the
      // orchestrator's `/api/v1/shell/...` path. Kept on a distinct prefix so it
      // does not collide with the `/api/v1` morph-idm proxy below.
      '/shell': {
        target: 'http://localhost:4221',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/shell/, '/api/v1/shell'),
      },
      // Real morph-idm workflow backend (test env). The browser calls
      // same-origin `/api/v1/...` and Vite forwards to the backend.
      '/api/v1': {
        target: 'https://test-vnext-morph-idm.apps.nonprod.ebt.bank',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
