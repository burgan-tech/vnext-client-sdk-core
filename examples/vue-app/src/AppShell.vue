<script setup lang="ts">
import { computed } from 'vue';
import type { IPageRouter } from 'page-router';
import { PageRouterShell, usePageRouter } from 'page-router-vue';
import { NAV } from './sdk/router';
import ConfirmDialog from './components/ConfirmDialog.vue';

const props = defineProps<{ router: IPageRouter }>();

// Reactive router state (active tab, open tabs, …) auto-wired to the SDK events.
const state = usePageRouter(props.router);

const activeKey = computed(() => state.activeTab.value?.item.key ?? 'home');

function go(routeKey: string) {
  void props.router.navigate({ routeKey });
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">vNext<span>SDK</span></div>
      <nav>
        <button
          v-for="n in NAV"
          :key="n.key"
          class="nav-item"
          :class="{ active: activeKey === n.key }"
          @click="go(n.key)"
        >
          <i :class="n.icon" />
          <span>{{ n.label }}</span>
        </button>
      </nav>
      <div class="foot">5 SDKs · 1 app</div>
    </aside>

    <main class="content">
      <PageRouterShell :router="props.router" />
    </main>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 240px; flex-shrink: 0; background: var(--panel);
  border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 1rem;
}
.brand { font-weight: 800; font-size: 1.3rem; margin: .5rem .5rem 1.5rem; letter-spacing: -.02em; }
.brand span { color: var(--accent); }
nav { display: flex; flex-direction: column; gap: .25rem; flex: 1; }
.nav-item {
  display: flex; align-items: center; gap: .7rem; text-align: left;
  background: transparent; border: none; color: inherit; cursor: pointer;
  padding: .65rem .8rem; border-radius: 8px; font-size: .95rem;
}
.nav-item:hover { background: var(--hover); }
.nav-item.active { background: var(--accent); color: #fff; }
.foot { font-size: .75rem; color: var(--muted); padding: .5rem; }
.content { flex: 1; padding: 2rem 2.5rem; overflow: auto; }
</style>
