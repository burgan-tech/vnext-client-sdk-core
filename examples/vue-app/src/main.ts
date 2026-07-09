// ─────────────────────────────────────────────────────────────────────────
// Bootstrap — wires all 5 vNext SDKs into one Vue 3 app.
//
//   1. PrimeVue + Aura theme + CSS   (required by pseudo-ui widgets)
//   2. MSW                            (mocks morph-api's network in-browser)
//   3. context-store + workflow       (provided app-wide)
//   4. page-router                    (async boot → mounted as the app shell)
// ─────────────────────────────────────────────────────────────────────────
import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import '@burgan-tech/pseudo-ui/vue/style.css';
import './styles.css';

import AppShell from './AppShell.vue';
import { worker } from './mocks/browser';
import { bootRouter } from './sdk/router';
import { contextStore, CONTEXT_STORE_KEY } from './sdk/context';
import { workflowManager } from './sdk/workflow';
import { WorkflowManagerKey } from 'amorphie-workflow-manager-vue';
import { ensureMorphAuth } from './sdk/morph';

// 1. Start the mock network layer before anything makes a request.
await worker.start({ onUnhandledRequest: 'bypass' });

// 2. Prime the morph client-credentials token (via the mocked token endpoint)
//    so the first workflow/IDM request is already authenticated. Non-fatal:
//    the app still mounts if this fails (IDM screens will just show an error).
try {
  await ensureMorphAuth();
} catch {
  /* already logged by ensureMorphAuth */
}

// 3. Boot the page-router (async) — it navigates to the "home" route.
const router = await bootRouter();

// 3. Create the app, install PrimeVue, provide shared SDK singletons, mount.
const app = createApp(AppShell, { router });
app.use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.dark-mode' } } });
app.use(ToastService);
app.provide(CONTEXT_STORE_KEY, contextStore);
app.provide(WorkflowManagerKey, workflowManager);
app.mount('#app');

// eslint-disable-next-line no-console
console.info('%c[vue-app] ✅ mounted — 5 SDKs wired', 'color:#4f46e5;font-weight:bold');
