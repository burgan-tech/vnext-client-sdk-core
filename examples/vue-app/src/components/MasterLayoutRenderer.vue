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
import { ShellMode, type OpenTab } from 'page-router';
import { PageRouterShell } from 'page-router-vue';
import type { NavItem, TokenLevel, LocalizedText } from '@burgan-tech/app-host';
import { loadShellView } from '../boot/appHost';
import { localize } from '../sdk/i18n';

const props = defineProps<{
  master: Record<string, unknown> | null;
  router: IPageRouter;
  navItems: NavItem[];
  profileItems: NavItem[];
  tokenLevel: TokenLevel;
  status: {
    registered: string;
    contexts: Array<{ key: string; label: string; command: string }>;
    identity: string;
    isLoggedIn: boolean;
  };
  onToken: (level: TokenLevel) => void;
  onLogout: () => void;
}>();

// Active locale (TR/EN) for the chrome's LocalizedString bindings.
const routerState = usePageRouter(props.router);
const lang = computed(() => routerState.locale.value);

// Live MDI state → the backend TabStrip component (open tabs + shell mode).
const isMdi = computed(() => routerState.shellMode.value === ShellMode.mdi);
const tabs = computed(() =>
  routerState.openTabs.value.map((t: OpenTab) => {
    const item = t.item as { title?: LocalizedText; key?: string } | undefined;
    return {
      tabKey: t.tabKey,
      label: localize(item?.title, lang.value) || item?.key || t.tabKey,
      active: t.tabKey === routerState.activeTab.value?.tabKey,
      closable: t.isClosable,
    };
  }),
);

// Data fed to the backend chrome view (Navigation lists, tab strip, profile
// sub-view) via bound instance data. No UI here — just values the views bind to.
const instanceData = computed(() => ({
  sidebarItems: props.navItems,
  profileItems: props.profileItems,
  status: props.status,
  identity: props.status.identity,
  isLoggedIn: props.status.isLoggedIn,
  tabs: tabs.value,
  isMdi: isMdi.value,
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
  // The router active-view surface (page-router-vue's own shell) is the only
  // host component; the tab strip is now the backend TabStrip. The scroll
  // wrapper is layout plumbing (keeps the chrome fixed), not content.
  resolveHostComponent: (ref) => {
    if (ref === 'router')
      return () => h('div', { class: 'router-body' }, [h(PageRouterShell, { router: props.router })]);
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
    // TabStrip intents (MDI): activate / close an open tab.
    if (action === 'tab:activate') {
      const tabKey = (data as { tabKey?: string } | undefined)?.tabKey;
      if (tabKey) props.router.activateTab(tabKey);
      return;
    }
    if (action === 'tab:close') {
      const tabKey = (data as { tabKey?: string } | undefined)?.tabKey;
      if (tabKey) props.router.closeTab(tabKey);
      return;
    }
    const cmd = command ?? '';
    let m: RegExpExecArray | null;
    if ((m = /^urn:shell:locale:(\w+)$/.exec(cmd))) props.router.setLocale(m[1]!);
    else if ((m = /^urn:shell:mode:(sdi|mdi)$/.exec(cmd))) void props.router.setShellMode(m[1] as ShellMode);
    // Any token context the client advertises is switchable — no hardcoded levels.
    else if ((m = /^urn:shell:token:(.+)$/.exec(cmd))) props.onToken(m[1] as TokenLevel);
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
    <div v-else class="router-body"><PageRouterShell :router="router" /></div>
  </div>
</template>
