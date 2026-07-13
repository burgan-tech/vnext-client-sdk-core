<!--
  Generic view surface for one navigation item. page-router mounts this for every
  route and passes `item` (route key). The full NavItem (type + config) is resolved
  from the app-host `itemsByKey` map. Each item renders through pseudo-ui:
  - dynamicView → the referenced shell View (fetched by key)
  - workflow    → a WorkflowView node (pseudo-ui drives + renders the workflow)
  - group/webView → a small backend-shaped view built from the item's children
  No per-type host UI/business rules — pseudo-ui renders, this maps intents.
-->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';
import type { ViewDefinition, PseudoViewDelegate } from '@burgan-tech/pseudo-ui';
import { PseudoView } from '@burgan-tech/pseudo-ui/vue';
import { loadShellView } from '../boot/appHost';
import { makeDriveWorkflow } from '../boot/workflowDriver';
import { localize } from '../sdk/i18n';
import { ITEMS_BY_KEY, APP_ROUTER, APP_SET_TOKEN_LEVEL } from '../boot/keys';

const props = defineProps<{ item: { key: string } }>();

const itemsByKey = inject(ITEMS_BY_KEY, new Map<string, NavItem>());
const router = inject<IPageRouter | null>(APP_ROUTER, null);
const setTokenLevel = inject<((level: TokenLevel) => void) | null>(APP_SET_TOKEN_LEVEL, null);

// Active locale (TR/EN) drives which LocalizedString branch pseudo-ui renders.
const routerState = router ? usePageRouter(router) : null;
const lang = computed(() => routerState?.locale.value ?? 'en');
const t = (v: NavItem['title']) => localize(v, lang.value);

const nav = computed<NavItem | undefined>(() => itemsByKey.get(props.item.key));

function go(key?: string) {
  if (key && router) void router.navigate({ routeKey: key });
}

// ── The view rendered for this item, as a pseudo-ui ViewDefinition ──────────
// dynamicView content is fetched by key; the others are synthesized so every
// item flows through the same renderer + delegate (no bespoke host markup).
const dynView = ref<ViewDefinition | null>(null);
const loading = ref(false);
watch(
  nav,
  async (n) => {
    const key = n?.type === 'dynamicView' ? (n.config?.['key'] as string | undefined) : undefined;
    if (!key) {
      dynView.value = null;
      return;
    }
    // Clear stale content + show a loader while the (possibly slow) fetch runs,
    // so switching tabs never leaves the previous view's content on screen.
    dynView.value = null;
    loading.value = true;
    try {
      dynView.value = (await loadShellView(key)) as ViewDefinition | null;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

// A workflow nav item carries { key: <workflow name>, domain, version, start, ... }
// → a WorkflowView node pseudo-ui renders and drives via delegate.driveWorkflow.
function workflowView(n: NavItem): ViewDefinition {
  const c = n.config ?? {};
  return {
    view: {
      type: 'WorkflowView',
      domain: String(c['domain'] ?? 'morph-idm'),
      name: String(c['key'] ?? n.key ?? ''),
      ...(c['version'] ? { version: String(c['version']) } : {}),
      ...(c['keyFrom'] ? { keyFrom: String(c['keyFrom']) } : {}),
      ...(c['start'] ? { start: c['start'] as Record<string, unknown> } : {}),
      ...(c['startFields'] ? { startFields: c['startFields'] } : {}),
    },
  } as unknown as ViewDefinition;
}

const viewDef = computed<ViewDefinition | null>(() => {
  const n = nav.value;
  if (!n) return null;
  if (n.type === 'dynamicView') return dynView.value;
  if (n.type === 'workflow') return workflowView(n);
  return null;
});

const children = computed<NavItem[]>(() => nav.value?.children ?? []);

// ── One delegate for every rendered view ────────────────────────────────────
const delegate: PseudoViewDelegate = {
  requestData: async (ref) => {
    throw new Error(`[NavView] no data source for "${ref}"`);
  },
  loadComponent: async (ref) => {
    const content = await loadShellView(ref);
    return { schema: { type: 'object', properties: {} }, view: (content ?? { view: {} }) as ViewDefinition };
  },
  // The workflow driver (owns the workflow client + interactive-login success).
  driveWorkflow: makeDriveWorkflow({ setTokenLevel: setTokenLevel ?? undefined }),
  async onAction(action, _data, command) {
    if (action !== 'submit') return;
    // pseudo-ui button `command` convention: urn:shell:navigate:<type>:<key>
    const m = /^urn:shell:navigate:[^:]+:(.+)$/.exec(command ?? '');
    if (m) go(m[1]);
  },
  onLog: (level, message) => console.debug(`%c[pseudo-ui] ${level}: ${message}`, 'color:#06c'),
};
</script>

<template>
  <div class="navview">
    <template v-if="!nav">
      <p class="muted">Unknown route: {{ props.item.key }}</p>
    </template>

    <!-- dynamicView: pseudo-ui content fetched by key from shell/Views -->
    <PseudoView
      v-else-if="viewDef && nav.type === 'dynamicView'"
      :schema="{ type: 'object', properties: {} }"
      :view="viewDef"
      :form-data="{}"
      :lang="lang"
      :delegate="delegate"
    />
    <div v-else-if="nav.type === 'dynamicView' && loading" class="navview-loading">
      <div class="boot-spinner" />
    </div>

    <!-- workflow: pseudo-ui drives + renders the backend state machine -->
    <section v-else-if="nav.type === 'workflow' && viewDef">
      <h2>{{ t(nav.title) || nav.key }}</h2>
      <p v-if="nav.subtitle" class="muted">{{ t(nav.subtitle) }}</p>
      <PseudoView
        :schema="{ type: 'object', properties: {} }"
        :view="viewDef"
        :form-data="{}"
        :lang="lang"
        :delegate="delegate"
      />
    </section>

    <!-- group: render children as a card menu -->
    <section v-else-if="nav.type === 'group'">
      <h2>{{ t(nav.title) }}</h2>
      <p v-if="nav.subtitle" class="muted">{{ t(nav.subtitle) }}</p>
      <div class="cards">
        <button v-for="c in children" :key="c.key" class="card" @click="go(c.key)">
          <strong>{{ t(c.title) }}</strong>
          <span v-if="c.subtitle" class="muted">{{ t(c.subtitle) }}</span>
          <em class="tag">{{ c.type }}</em>
        </button>
      </div>
    </section>

    <!-- webView -->
    <section v-else-if="nav.type === 'webView'">
      <h2>{{ t(nav.title) }}</h2>
      <a :href="String(nav.config?.url ?? '#')" target="_blank" rel="noopener">{{ nav.config?.url }}</a>
    </section>

    <!-- staticView / other: phase-2 placeholder -->
    <section v-else>
      <h2>{{ t(nav.title) || nav.key }}</h2>
      <p class="muted">Type “{{ nav.type }}” — phase 2.</p>
      <pre class="cfg">{{ JSON.stringify(nav.config, null, 2) }}</pre>
    </section>
  </div>
</template>

<style scoped>
.navview { max-width: 720px; }
.navview-loading { display: flex; justify-content: center; padding: 3rem 0; }
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
