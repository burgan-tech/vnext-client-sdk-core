<!--
  Thin host: NO hardcoded chrome. The entire app shell (brand, token switcher,
  nav, status, app bar, content region) is the backend master-layout View,
  rendered by MasterLayoutRenderer. This component only feeds the outlets their
  dynamic data (nav items, status, token-switch handler) and the router.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { AppHost, NavItem, TokenLevel } from '@burgan-tech/app-host';
import { Boundary, Storage, getContextValue } from './sdk/context';
import MasterLayoutRenderer from './components/MasterLayoutRenderer.vue';

const props = defineProps<{
  router: IPageRouter;
  host: AppHost;
  onSwitch: (level: TokenLevel) => void;
}>();

const state = usePageRouter(props.router);
const master = computed(() => state.masterLayout.value as Record<string, unknown> | null);
const navItems = computed<NavItem[]>(() =>
  props.host.state.navigation.items.filter((i) => i.key && i.type !== 'divider'),
);

const statusLine = computed(() => {
  const r = props.host.state.deviceRegistration;
  const held = (key: string, b: Boundary) => (getContextValue(key, { boundary: b, storage: Storage.memory }) ? '✓' : '·');
  const device = props.host.state.deviceToken ? '✓' : held('auth.token.morph-idm-device.access', Boundary.device);
  const oneFa = held('auth.token.morph-idm-1fa.access', Boundary.user);
  const twoFa = held('auth.token.morph-idm-2fa.access', Boundary.user);
  const reg = r?.deviceInstanceId ? `${r.deviceInstanceId.slice(0, 8)}(${r.status})` : 'no';
  return `registered ${reg} · tokens device${device} 1fa${oneFa} 2fa${twoFa} · ${props.host.state.shellMode}`;
});
</script>

<template>
  <MasterLayoutRenderer
    :master="master"
    :router="props.router"
    :nav-items="navItems"
    :status-line="statusLine"
    :on-token="props.onSwitch"
  />
</template>
