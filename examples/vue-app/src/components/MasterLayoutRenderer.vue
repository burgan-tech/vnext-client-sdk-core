<!--
  Renders the backend-defined master layout (app chrome) as a pseudo-ui view.
  The layout is fetched by key from shell/Views. It embeds ContentOutlets that we
  resolve to host components — `router` → the page-router shell, `nav` → the
  dynamic NavMenu — and nested sub-components (brand, token switcher) fetched by
  key. Chrome actions (token switcher) bubble here via the shared delegate.
-->
<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import type { IPageRouter } from 'page-router';
import { PageRouterShell } from 'page-router-vue';
import { PseudoView } from '@burgan-tech/pseudo-ui/vue';
import type { ViewDefinition, PseudoViewDelegate } from '@burgan-tech/pseudo-ui';
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';
import { loadShellView } from '../boot/appHost';
import NavMenu from './NavMenu.vue';

const props = defineProps<{
  master: Record<string, unknown> | null;
  router: IPageRouter;
  navItems: NavItem[];
  statusLine: string;
  onToken: (level: TokenLevel) => void;
}>();

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

// Data bound into the master view (e.g. Text content "$instance.statusLine").
const instanceData = computed(() => ({ statusLine: props.statusLine }));

const delegate: PseudoViewDelegate = {
  requestData: async (ref) => {
    throw new Error(`[master] no data source for "${ref}"`);
  },
  // Nested chrome sub-components (brand, tokenbar) are shell Views fetched by key.
  loadComponent: async (ref) => {
    const content = await loadShellView(ref);
    return { schema: { type: 'object', properties: {} }, view: (content ?? { view: {} }) as ViewDefinition };
  },
  // ContentOutlets → host components.
  resolveHostComponent: (ref) => {
    if (ref === 'router') return () => h(PageRouterShell, { router: props.router });
    if (ref === 'nav') return () => h(NavMenu, { items: props.navItems, router: props.router });
    return null;
  },
  // Chrome actions (token switcher) reach here via the shared delegate.
  onAction: async (_action, _data, command) => {
    const tok = /^urn:shell:token:(device|1fa|2fa)$/.exec(command ?? '');
    if (tok) props.onToken(tok[1] as TokenLevel);
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
      lang="en"
      :delegate="delegate"
    />
    <PageRouterShell v-else :router="router" />
  </div>
</template>
