<!--
  Thin host: NO hardcoded chrome. The entire app shell (brand, nav, app bar,
  profile menu, content region) is the backend master-layout View, rendered by
  MasterLayoutRenderer. This component only feeds the outlets their dynamic data
  (nav items, session status, logout handler) and the router.

  Navigation comes as TWO backend records: `sidebar` (content menu) and `profile`
  (account-dropdown items, e.g. login). Logout + dev switches are host session
  controls surfaced in the profile menu.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { MorphTokenStatus } from '@morph/core';
import type { AppHost, NavItem, TokenLevel } from '@burgan-tech/app-host';
import { Boundary, Storage, setContextValue, contextStore } from './sdk/context';
import { getMorphClient } from './boot/morphClient';
import MasterLayoutRenderer from './components/MasterLayoutRenderer.vue';

const props = defineProps<{
  router: IPageRouter;
  host: AppHost;
  onSwitch: (level: TokenLevel) => void;
}>();

const state = usePageRouter(props.router);
const master = computed(() => state.masterLayout.value as Record<string, unknown> | null);

const sidebarItems = computed<NavItem[]>(() =>
  props.host.state.navigation.sidebar.filter((i) => i.key && i.type !== 'divider'),
);
const profileItems = computed<NavItem[]>(() =>
  props.host.state.navigation.profile.filter((i) => i.key && i.type !== 'divider'),
);

const tokenLevel = computed<TokenLevel>(() => props.host.state.tokenLevel);

// Token presence comes from the generic client (getTokenStatus) — no hardcoded
// provider/level/context-store keys. Refreshed on mount (re-boot re-mounts).
const tokenStatus = ref<MorphTokenStatus[]>([]);
onMounted(async () => {
  tokenStatus.value = (await getMorphClient()?.getTokenStatus()) ?? [];
});

const status = computed(() => {
  const r = props.host.state.deviceRegistration;
  return {
    contexts: tokenStatus.value.map((s) => ({ key: s.contextKey, ok: s.hasAccessToken })),
    registered: r?.deviceInstanceId ? `${r.deviceInstanceId.slice(0, 8)}(${r.status})` : 'no',
  };
});

// Logout: clear the user (interactive) contexts via the client, drop the active
// user, re-home at device. (Transitional: also clears the legacy context-store
// user tokens that resolveTokenLevel still reads — removed with Phase 4b.)
async function onLogout(): Promise<void> {
  const morph = getMorphClient();
  if (morph) {
    for (const s of await morph.getTokenStatus()) {
      if (s.grantHint !== 'client_credentials' && s.hasAccessToken) await morph.auth(s.authId).clearTokens();
    }
  }
  setContextValue('auth.token.morph-idm-2fa.access', null, { boundary: Boundary.user, storage: Storage.memory });
  setContextValue('auth.token.morph-idm-2fa.refresh', null, { boundary: Boundary.user, storage: Storage.localStorage });
  setContextValue('auth.token.morph-idm-1fa.access', null, { boundary: Boundary.user, storage: Storage.memory });
  contextStore.activeUser = null;
  props.onSwitch('device');
}
</script>

<template>
  <MasterLayoutRenderer
    :master="master"
    :router="props.router"
    :nav-items="sidebarItems"
    :profile-items="profileItems"
    :token-level="tokenLevel"
    :status="status"
    :on-token="props.onSwitch"
    :on-logout="onLogout"
  />
</template>
