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
import type { AppHost, TokenLevel } from '@burgan-tech/app-host';

import HostShell from './HostShell.vue';
import NavView from './components/NavView.vue';
import { bootAppHost } from './boot/appHost';
import { workflowManager } from './boot/workflowClient';
import { runInitialization, type InitEntry } from './boot/initialization';
import { getMorphClient } from './boot/morphClient';
import { loadAndApplyTheme } from './boot/theme';
import { CTX } from './boot/constants';
import { Boundary, Storage, setContextValue } from './sdk/context';
import {
  ITEMS_BY_KEY,
  APP_ROUTER,
  APP_SET_TOKEN_LEVEL,
  APP_UI_STRINGS,
  APP_DATA_DOMAIN,
  APP_CONFIG_VIEWS,
} from './boot/keys';

let app: App | null = null;
let disposeHistory: (() => void) | null = null;
// The app-host is booted ONCE (discovery + device provisioning + token). A
// token-level switch (login/logout) reuses it via `setTokenLevel` — which re-pulls
// only navigation — instead of re-running the whole 30s–2min discovery chain.
let appHost: AppHost | null = null;

/** Render the app for the current (or switched) token level. First call boots the
 * host; a token-level switch reuses it and re-pulls only the level's navigation. */
async function start(overrideLevel?: TokenLevel): Promise<void> {
  const host = appHost ?? (appHost = await bootAppHost());
  if (overrideLevel && overrideLevel !== host.state.tokenLevel) await host.setTokenLevel(overrideLevel);

  // Theme (a slow shell read) is global to the client and applied to the document
  // root, so apply it once on first boot — not on every token-level switch.
  if (!overrideLevel) {
    const themeCfg = host.state.clientConfig.theme as { default?: string } | undefined;
    await loadAndApplyTheme(themeCfg?.default ?? 'default');
  }

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

  // Mirror the active locale onto the shared bus (context-store) so API clients
  // (e.g. Accept-Language) follow the selected language without hardcoding.
  const mem = { boundary: Boundary.device, storage: Storage.memory };
  const writeLocale = (l: string) => setContextValue(CTX.locale, l, mem);
  writeLocale(router.getLocale());
  router.onLocaleChanged(writeLocale);
  // IDM host base resolved from the environment `hosts` config → shared bus.
  if (host.state.idmBase) setContextValue(CTX.idmBase, host.state.idmBase, mem);

  // The generic morph-api-client is initialized during discovery (afterEnvironment)
  // and owns the tokens; log its status for visibility.
  const morph = getMorphClient();
  if (morph) {
    const s = await morph.getTokenStatus();
    // eslint-disable-next-line no-console
    console.info(
      `%c[morph] providers=${morph.getProviders().map((p) => p.key).join(',')} ` +
        `hosts=${morph.getHosts().map((h) => h.key).join(',')} tokens=[${s.map((t) => `${t.providerKey}/${t.contextKey}:${t.hasAccessToken ? '✓' : '·'}`).join(' ')}]`,
      'color:#8a2be2;font-weight:bold',
    );
  }

  // Wire the browser Back/Forward buttons to the router's own history so SDI
  // navigation doesn't unload the SPA. Re-bind on re-boot (fresh router).
  disposeHistory?.();
  disposeHistory = bindBrowserHistory(router);

  if (app) app.unmount();
  app = createApp(HostShell, { router, host, onSwitch: reboot });
  app.use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ToastService);
  app.provide(ITEMS_BY_KEY, host.built.itemsByKey);
  app.provide(APP_ROUTER, router);
  app.provide(APP_SET_TOKEN_LEVEL, reboot);
  app.provide(APP_UI_STRINGS, host.state.clientConfig.i18n?.strings ?? {});
  app.provide(APP_DATA_DOMAIN, (host.state.clientConfig.dataDomain as string | undefined) ?? '');
  app.provide(APP_CONFIG_VIEWS, (host.state.clientConfig.views as Record<string, unknown> | undefined) ?? {});
  app.mount('#app');

  // eslint-disable-next-line no-console
  console.info(
    `%c[vue-app] ✅ booted from clientId=${host.state.clientId} → homepage=${host.built.homepageKey} (tokenLevel=${host.state.tokenLevel}, ${host.state.shellMode})`,
    'color:#4f46e5;font-weight:bold',
  );

  // Run the config-driven initialization workflows ONCE (first boot, not on a
  // token-level re-boot), after mount so the UI is up. Headless + tolerant; the
  // x-context-source filter fills each payload from context-store.
  if (!overrideLevel) {
    const init = (host.state.clientConfig.initialization ?? []) as InitEntry[];
    if (init.length) void runInitialization(workflowManager, init, { tokenLevel: host.state.tokenLevel });
  }
}

/** Re-boot for a token-level switch / post-login flip. Surfaces failures like the
 * initial boot instead of leaving a stale/half-torn-down UI on a silent rejection. */
function reboot(level: TokenLevel): void {
  void start(level).catch(showBootError);
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
