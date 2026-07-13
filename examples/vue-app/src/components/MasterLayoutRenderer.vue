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
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';
import { loadShellView } from '../boot/appHost';
import RouterOutlet from './RouterOutlet.vue';
import ProfileMenu from './ProfileMenu.vue';

const props = defineProps<{
  master: Record<string, unknown> | null;
  router: IPageRouter;
  navItems: NavItem[];
  profileItems: NavItem[];
  tokenLevel: TokenLevel;
  status: { registered: string; contexts: Array<{ key: string; ok: boolean }> };
  onToken: (level: TokenLevel) => void;
  onLogout: () => void;
}>();

// Active locale (TR/EN) for the chrome's LocalizedString bindings.
const routerState = usePageRouter(props.router);
const lang = computed(() => routerState.locale.value);

// Nav items fed to the backend view's `Navigation` components via bound instance data.
const instanceData = computed(() => ({
  sidebarItems: props.navItems,
  profileItems: props.profileItems,
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
  // ContentOutlets → host components (placement is backend; content is host).
  resolveHostComponent: (ref) => {
    if (ref === 'router') return () => h(RouterOutlet, { router: props.router });
    if (ref === 'profile')
      return () =>
        h(ProfileMenu, {
          router: props.router,
          tokenLevel: props.tokenLevel,
          navItems: props.profileItems,
          status: props.status,
          onToken: props.onToken,
          onLogout: props.onLogout,
        });
    return null;
  },
  // The `Navigation` component emits a `navigate` intent with the tapped item;
  // map it to the router (the one generic seam — no per-item UI in the client).
  onAction: async (action, data) => {
    if (action === 'navigate') {
      const key = (data as { key?: string } | undefined)?.key;
      if (key) void props.router.navigate({ routeKey: key });
    }
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
