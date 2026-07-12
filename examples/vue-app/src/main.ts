// ─────────────────────────────────────────────────────────────────────────
// Bootstrap — the app comes up from ONE constant (clientId). Everything else
// (master layout, homepage, views, routing, token level) is pulled from the
// backend `shell` domain by @burgan-tech/app-host. No views or business rules
// are hardcoded on the boot path.
//
//   clientId → app-host discovery → RouteRegistry → page-router → homepage view
// ─────────────────────────────────────────────────────────────────────────
import { createApp, type App } from 'vue';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import '@burgan-tech/pseudo-ui/vue/style.css';
import './styles.css';

import { createPageRouter } from 'page-router';
import { createVueSurfaceFactory, bindBrowserHistory } from 'page-router-vue';
import type { TokenLevel } from '@burgan-tech/app-host';

import HostShell from './HostShell.vue';
import NavView from './components/NavView.vue';
import { bootAppHost } from './boot/appHost';
import { loadAndApplyTheme } from './boot/theme';
import { ITEMS_BY_KEY, APP_ROUTER, APP_SET_TOKEN_LEVEL } from './boot/keys';

let app: App | null = null;
let disposeHistory: (() => void) | null = null;

/** Boot (or re-boot for a token-level switch) the whole app from app-host. */
async function start(overrideLevel?: TokenLevel): Promise<void> {
  const host = await bootAppHost();
  if (overrideLevel) await host.setTokenLevel(overrideLevel);

  // Apply the default theme (loaded from the shell `theme` workflow) before mount.
  const themeCfg = host.state.clientConfig.theme as { default?: string } | undefined;
  await loadAndApplyTheme(themeCfg?.default ?? 'default');

  const router = await createPageRouter({
    routeRegistry: host.built.registry,
    onEvaluate: async ({ item }) => [item],
    onNavigate: async () => undefined,
    // One generic surface renders every route by its NavItem type.
    createViewSurface: createVueSurfaceFactory(() => NavView),
    disposeViewSurface: async () => undefined,
    onLog: (level, code) => console.debug(`%c[page-router] ${level}: ${code}`, 'color:#c60'),
  });
  await router.navigate({ routeKey: host.built.homepageKey });
  // Master layout (app chrome) is a backend view, swapped per token level.
  router.setMasterLayout(host.state.navigation.masterLayout ?? null);

  // Wire the browser Back/Forward buttons to the router's own history so SDI
  // navigation doesn't unload the SPA. Re-bind on re-boot (fresh router).
  disposeHistory?.();
  disposeHistory = bindBrowserHistory(router);

  if (app) app.unmount();
  app = createApp(HostShell, { router, host, onSwitch: (lvl: TokenLevel) => void start(lvl) });
  app.use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.provide(ITEMS_BY_KEY, host.built.itemsByKey);
  app.provide(APP_ROUTER, router);
  app.provide(APP_SET_TOKEN_LEVEL, (lvl: TokenLevel) => void start(lvl));
  app.mount('#app');

  // eslint-disable-next-line no-console
  console.info(
    `%c[vue-app] ✅ booted from clientId=${host.state.clientId} → homepage=${host.built.homepageKey} (tokenLevel=${host.state.tokenLevel}, ${host.state.shellMode})`,
    'color:#4f46e5;font-weight:bold',
  );
}

/** Minimal boot splash so the (slow, real-IDM) discovery never shows a blank page. */
function showSplash(): void {
  const el = document.getElementById('app');
  if (el) el.innerHTML = '<div class="boot-splash"><div class="boot-spinner"></div><p>Yükleniyor…</p></div>';
}
function showBootError(e: unknown): void {
  const el = document.getElementById('app');
  const msg = e instanceof Error ? e.message : String(e);
  if (el) {
    el.innerHTML =
      `<div class="boot-error"><h2>Başlatılamadı</h2><p>${msg}</p>` +
      `<button onclick="location.reload()">Tekrar dene</button></div>`;
  }
  console.error('[vue-app] boot failed', e);
}

showSplash();
start().catch(showBootError);
