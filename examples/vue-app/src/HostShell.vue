<!--
  Application shell driven entirely by app-host. The sidebar is built from the
  backend navigation (no hardcoded menu); a token-level switcher demonstrates the
  device → 1FA → 2FA dashboard switch (re-boots via the onSwitch callback).
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { IPageRouter } from 'page-router';
import { PageRouterShell, usePageRouter } from 'page-router-vue';
import type { AppHost, NavItem, TokenLevel } from '@burgan-tech/app-host';

const props = defineProps<{
  router: IPageRouter;
  host: AppHost;
  onSwitch: (level: TokenLevel) => void;
}>();

const state = usePageRouter(props.router);
const activeKey = computed(() => state.activeTab.value?.item.key ?? props.host.built.homepageKey);

// Top-level navigable items (skip dividers / keyless).
const menu = computed<NavItem[]>(() =>
  props.host.state.navigation.items.filter((i) => i.key && i.type !== 'divider'),
);
const level = computed(() => props.host.state.tokenLevel);
const levels: TokenLevel[] = ['device', '1fa', '2fa'];

function go(key?: string) {
  if (key) void props.router.navigate({ routeKey: key });
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">shell<span>·{{ host.state.clientId }}</span></div>

      <div class="level">
        <span class="muted">token</span>
        <div class="seg">
          <button
            v-for="l in levels"
            :key="l"
            :class="{ on: level === l }"
            @click="props.onSwitch(l)"
          >{{ l }}</button>
        </div>
      </div>

      <nav>
        <button
          v-for="n in menu"
          :key="n.key"
          class="nav-item"
          :class="{ active: activeKey === n.key }"
          @click="go(n.key)"
        >
          <span>{{ n.title ?? n.key }}</span>
          <em>{{ n.type }}</em>
        </button>
      </nav>

      <div class="foot">
        <div>homepage: {{ host.built.homepageKey }} · {{ host.state.shellMode }}</div>
        <div class="dev">
          <div>device: <code>{{ host.state.deviceIdentity?.deviceId?.slice(0, 8) ?? '—' }}</code></div>
          <div>install: <code>{{ host.state.deviceIdentity?.installationId?.slice(0, 8) ?? '—' }}</code></div>
          <div>registered: <span :class="host.state.deviceRegistration?.deviceInstanceId ? 'ok' : 'no'">{{ host.state.deviceRegistration?.deviceInstanceId ? (host.state.deviceRegistration.deviceInstanceId.slice(0, 8) + ' (' + host.state.deviceRegistration.status + ')') : 'no' }}</span></div>
          <div>token: <span :class="host.state.deviceToken ? 'ok' : 'no'">{{ host.state.deviceToken ? 'device ✓' : 'none' }}</span></div>
        </div>
      </div>
    </aside>

    <main class="content">
      <PageRouterShell :router="props.router" />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 260px; flex-shrink: 0; background: var(--panel, #14141b);
  border-right: 1px solid var(--border, #2a2a35); display: flex; flex-direction: column; padding: 1rem; gap: 1rem;
}
.brand { font-weight: 800; font-size: 1.25rem; letter-spacing: -.02em; }
.brand span { color: var(--accent, #4f46e5); }
.level { display: flex; align-items: center; justify-content: space-between; }
.seg { display: flex; gap: .2rem; }
.seg button {
  border: 1px solid var(--border, #2a2a35); background: transparent; color: inherit;
  padding: .2rem .5rem; border-radius: 6px; cursor: pointer; font-size: .75rem;
}
.seg button.on { background: var(--accent, #4f46e5); color: #fff; border-color: var(--accent, #4f46e5); }
.muted { color: var(--muted, #889); font-size: .8rem; }
nav { display: flex; flex-direction: column; gap: .25rem; flex: 1; }
.nav-item {
  display: flex; align-items: center; justify-content: space-between; gap: .5rem; text-align: left;
  background: transparent; border: none; color: inherit; cursor: pointer;
  padding: .6rem .7rem; border-radius: 8px; font-size: .92rem;
}
.nav-item em { font-size: .68rem; color: var(--muted, #889); text-transform: uppercase; }
.nav-item:hover { background: var(--hover, #1e1e28); }
.nav-item.active { background: var(--accent, #4f46e5); color: #fff; }
.nav-item.active em { color: #dcd7ff; }
.foot { font-size: .72rem; color: var(--muted, #889); display: flex; flex-direction: column; gap: .5rem; }
.foot .dev { display: flex; flex-direction: column; gap: .15rem; padding-top: .4rem; border-top: 1px solid var(--border, #2a2a35); }
.foot code { font-size: .68rem; }
.foot .ok { color: #2a9d3f; font-weight: 700; }
.foot .no { color: #c0392b; }
.content { flex: 1; padding: 2rem 2.5rem; overflow: auto; }
</style>
