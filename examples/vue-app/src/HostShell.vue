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
import { contextStore } from './sdk/context';
import { localize } from './sdk/i18n';
import { getMorphClient } from './boot/morphClient';
import { loadAndApplyTheme } from './boot/theme';
import MasterLayoutRenderer from './components/MasterLayoutRenderer.vue';
import BootFlowHost from './components/BootFlowHost.vue';

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

// Supported UI locales for the language switch come from client-config (i18n),
// not hardcoded in the chrome.
const locales = computed<Array<{ code: string; label: string }>>(
  () => props.host.state.clientConfig.i18n?.locales ?? [],
);

// Active UI locale + the config-fed generic UI-strings dictionary — so chrome
// labels the host itself supplies (e.g. the profile trigger) localize from
// config, never a hardcoded literal. A missing key falls back to the key id.
const lang = computed(() => state.locale.value ?? props.host.state.clientConfig.i18n?.default ?? 'en');
const uiStrings = computed<Record<string, unknown>>(() => props.host.state.clientConfig.i18n?.strings ?? {});
const uiText = (key: string) => localize(uiStrings.value[key] as never, lang.value) || key;

// Theme switch — available themes + default come from client-config; the active
// theme is applied at runtime via the shell `theme` workflow (loadAndApplyTheme).
const themeCfg = computed(
  () => props.host.state.clientConfig.theme as { default?: string; available?: string[] } | undefined,
);
const activeTheme = ref<string>(themeCfg.value?.default ?? 'default');
async function onTheme(key: string): Promise<void> {
  await loadAndApplyTheme(key);
  activeTheme.value = key;
}
const themeOptions = computed(() =>
  (themeCfg.value?.available ?? []).map((key) => ({
    label: key,
    command: `urn:shell:theme:${key}`,
    active: key === activeTheme.value,
  })),
);

// Token presence comes from the generic client (getTokenStatus) — no hardcoded
// provider/level/context-store keys. Refreshed on mount (re-boot re-mounts).
const tokenStatus = ref<MorphTokenStatus[]>([]);
onMounted(async () => {
  tokenStatus.value = (await getMorphClient()?.getTokenStatus()) ?? [];
});

const status = computed(() => {
  const r = props.host.state.deviceRegistration;
  const loggedIn = tokenLevel.value !== 'device';
  return {
    // Raw token contexts (key + presence). The chrome localizes the level
    // labels (from config) and formats the status glyph — no hardcoded levels
    // or presentation strings here.
    contexts: tokenStatus.value.map((s) => ({
      key: s.contextKey,
      has: s.hasAccessToken,
      command: `urn:shell:token:${s.contextKey}`,
    })),
    registered: r?.deviceInstanceId ? `${r.deviceInstanceId.slice(0, 8)}(${r.status})` : 'no',
    identity: uiText(loggedIn ? 'profile.account' : 'profile.guest'),
    isLoggedIn: loggedIn,
  };
});

// Logout: clear the user (interactive) contexts via the client, drop the active
// user, re-home at device. Token level then derives back to device.
async function onLogout(): Promise<void> {
  const morph = getMorphClient();
  if (morph) {
    for (const s of await morph.getTokenStatus()) {
      if (s.grantHint !== 'client_credentials' && s.hasAccessToken) await morph.auth(s.authId).clearTokens();
    }
  }
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
    :locales="locales"
    :theme-options="themeOptions"
    :on-token="props.onSwitch"
    :on-theme="onTheme"
    :on-logout="onLogout"
  />
  <!-- UI-surfacing initialization flows (e.g. a post-2FA email-update dialog),
       driven through the standard WorkflowView mechanism. -->
  <BootFlowHost />
</template>
