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
import { computed } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { AppHost, NavItem, TokenLevel } from '@burgan-tech/app-host';
import { Boundary, Storage, getContextValue, setContextValue, contextStore } from './sdk/context';
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

const status = computed(() => {
  const r = props.host.state.deviceRegistration;
  const held = (key: string, b: Boundary) =>
    getContextValue(key, { boundary: b, storage: Storage.memory }) ? '✓' : '·';
  return {
    device: props.host.state.deviceToken ? '✓' : held('auth.token.morph-idm-device.access', Boundary.device),
    oneFa: held('auth.token.morph-idm-1fa.access', Boundary.user),
    twoFa: held('auth.token.morph-idm-2fa.access', Boundary.user),
    registered: r?.deviceInstanceId ? `${r.deviceInstanceId.slice(0, 8)}(${r.status})` : 'no',
  };
});

// Logout: drop the user-boundary tokens + active user, then re-home at device.
function onLogout(): void {
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
