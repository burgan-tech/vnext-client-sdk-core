<!--
  Generic view surface for one navigation item. page-router mounts this for every
  route and passes `item` (which carries the route key). The full NavItem (with its
  type + config) is resolved from the app-host `itemsByKey` map provided at boot.
  Renders by item type — the seam where server-driven navigation meets the UI.
-->
<script setup lang="ts">
import { computed, inject } from 'vue';
import type { IPageRouter } from 'page-router';
import type { NavItem } from '@burgan-tech/app-host';
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import PseudoRenderer from './PseudoRenderer.vue';
import { ITEMS_BY_KEY, APP_ROUTER } from '../boot/keys';

const props = defineProps<{ item: { key: string } }>();

const itemsByKey = inject(ITEMS_BY_KEY, new Map<string, NavItem>());
const router = inject<IPageRouter | null>(APP_ROUTER, null);

const nav = computed<NavItem | undefined>(() => itemsByKey.get(props.item.key));
const inlineView = computed<ViewDefinition | undefined>(
  () => nav.value?.config?.['content'] as ViewDefinition | undefined,
);
const children = computed<NavItem[]>(() => nav.value?.children ?? []);

function go(key?: string) {
  if (key && router) void router.navigate({ routeKey: key });
}

// pseudo-ui button `command` convention: urn:shell:navigate:<type>:<key>
function onSubmit(payload: { command?: string; data: Record<string, unknown> }) {
  const cmd = payload.command ?? '';
  const m = /^urn:shell:navigate:[^:]+:(.+)$/.exec(cmd);
  if (m) go(m[1]);
  else console.info('[NavView] submit', payload);
}
</script>

<template>
  <div class="navview">
    <template v-if="!nav">
      <p class="muted">Unknown route: {{ props.item.key }}</p>
    </template>

    <!-- dynamicView with inline pseudo-ui content (phase 1 render path) -->
    <PseudoRenderer v-else-if="nav.type === 'dynamicView' && inlineView" :view="inlineView" @submit="onSubmit" />

    <!-- group: render children as a card menu -->
    <section v-else-if="nav.type === 'group'">
      <h2>{{ nav.title }}</h2>
      <p v-if="nav.subtitle" class="muted">{{ nav.subtitle }}</p>
      <div class="cards">
        <button v-for="c in children" :key="c.key" class="card" @click="go(c.key)">
          <strong>{{ c.title }}</strong>
          <span v-if="c.subtitle" class="muted">{{ c.subtitle }}</span>
          <em class="tag">{{ c.type }}</em>
        </button>
      </div>
    </section>

    <!-- webView -->
    <section v-else-if="nav.type === 'webView'">
      <h2>{{ nav.title }}</h2>
      <a :href="String(nav.config?.url ?? '#')" target="_blank" rel="noopener">{{ nav.config?.url }}</a>
    </section>

    <!-- workflow / staticView / other: phase-1 placeholder -->
    <section v-else>
      <h2>{{ nav.title ?? nav.key }}</h2>
      <p class="muted">Type “{{ nav.type }}” — phase 2.</p>
      <pre class="cfg">{{ JSON.stringify(nav.config, null, 2) }}</pre>
    </section>
  </div>
</template>

<style scoped>
.navview { max-width: 720px; }
.muted { color: var(--muted, #667); }
h2 { margin: 0 0 .25rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }
.card {
  display: flex; flex-direction: column; gap: .35rem; text-align: left; cursor: pointer;
  padding: 1rem; border: 1px solid var(--border, #ddd); border-radius: 12px; background: var(--panel, #fff);
}
.card:hover { border-color: var(--accent, #4f46e5); }
.tag { font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; color: var(--accent, #4f46e5); }
.cfg { font-size: .75rem; background: var(--hover, #f4f4f8); padding: .75rem; border-radius: 8px; overflow: auto; }
</style>
