<!--
  Renders the backend-defined master layout (app chrome) as a pseudo-ui view.
  The layout is fetched by key from shell/Views. It embeds ContentOutlets that we
  resolve to host components — `router` → the page-router shell, `nav` → the
  dynamic NavMenu, `profile` → the account/profile menu (session status, token &
  shell-mode switches, login/logout) — plus nested sub-components (brand) fetched
  by key. All chrome placement is backend; the interactive bits are host outlets.
-->
<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import { PseudoView } from '@burgan-tech/pseudo-ui/vue';
import type { ViewDefinition, PseudoViewDelegate } from '@burgan-tech/pseudo-ui';
import { ShellMode } from 'page-router';
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';
import { loadShellView } from '../boot/appHost';
import RouterOutlet from './RouterOutlet.vue';

const props = defineProps<{
  master: Record<string, unknown> | null;
  router: IPageRouter;
  navItems: NavItem[];
  profileItems: NavItem[];
  tokenLevel: TokenLevel;
  status: { registered: string; contexts: Array<{ label: string }>; identity: string; isLoggedIn: boolean };
  onToken: (level: TokenLevel) => void;
  onLogout: () => void;
}>();

// Active locale (TR/EN) for the chrome's LocalizedString bindings.
const routerState = usePageRouter(props.router);
const lang = computed(() => routerState.locale.value);

// Data fed to the backend chrome view (Navigation lists + the profile sub-view)
// via bound instance data. No UI here — just the values the views bind to.
const instanceData = computed(() => ({
  sidebarItems: props.navItems,
  profileItems: props.profileItems,
  status: props.status,
  identity: props.status.identity,
  isLoggedIn: props.status.isLoggedIn,
}));

// The master is a ref { key, ... }; fetch its View content by key.
const view = ref<ViewDefinition | null>(null);
watch(
  () => props.master,
  async (m) => {
    const key = m?.['key'] as string | undefined;
    view.value = key ? ((await loadShellView(key)) as ViewDefinition | null) : null;
  },
  { immediate: true },
);

const delegate: PseudoViewDelegate = {
  requestData: async (ref) => {
    throw new Error(`[master] no data source for "${ref}"`);
  },
  // Nested chrome sub-components (brand) are shell Views fetched by key.
  loadComponent: async (ref) => {
    const content = await loadShellView(ref);
    return { schema: { type: 'object', properties: {} }, view: (content ?? { view: {} }) as ViewDefinition };
  },
  // Only the router surface is a host component now; the profile is a backend view.
  resolveHostComponent: (ref) => {
    if (ref === 'router') return () => h(RouterOutlet, { router: props.router });
    return null;
  },
  // The single generic seam: backend chrome components emit intents, mapped here
  // to the router / session handlers. `navigate` (Navigation taps) + urn:shell:*
  // commands (profile switches / logout). No per-item UI in the client.
  onAction: async (action, data, command) => {
    if (action === 'navigate') {
      const key = (data as { key?: string } | undefined)?.key;
      if (key) void props.router.navigate({ routeKey: key });
      return;
    }
    const cmd = command ?? '';
    let m: RegExpExecArray | null;
    if ((m = /^urn:shell:locale:(\w+)$/.exec(cmd))) props.router.setLocale(m[1]!);
    else if ((m = /^urn:shell:mode:(sdi|mdi)$/.exec(cmd))) void props.router.setShellMode(m[1] as ShellMode);
    else if ((m = /^urn:shell:token:(device|1fa|2fa)$/.exec(cmd))) props.onToken(m[1] as TokenLevel);
    else if (cmd === 'urn:shell:logout') props.onLogout();
  },
  onLog: () => undefined,
};
</script>

<template>
  <div class="app-shell">
    <PseudoView
      v-if="view"
      :schema="{ type: 'object', properties: {} }"
      :view="view"
      :form-data="{}"
      :instance-data="instanceData"
      :lang="lang"
      :delegate="delegate"
    />
    <RouterOutlet v-else :router="router" />
  </div>
</template>
