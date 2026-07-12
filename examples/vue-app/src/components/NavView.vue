<!--
  Generic view surface for one navigation item. page-router mounts this for every
  route and passes `item` (which carries the route key). The full NavItem (with its
  type + config) is resolved from the app-host `itemsByKey` map provided at boot.
  Renders by item type — the seam where server-driven navigation meets the UI.
-->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { NavItem } from '@burgan-tech/app-host';
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import type { TokenLevel } from '@burgan-tech/app-host';
import PseudoRenderer from './PseudoRenderer.vue';
import WorkflowRunner from './WorkflowRunner.vue';
import { completeLogin } from '../boot/login';
import { loadShellView } from '../boot/appHost';
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
const children = computed<NavItem[]>(() => nav.value?.children ?? []);

// dynamicView: fetch the referenced View's content by key from the shell backend.
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

// A workflow nav item carries { key: <workflow name>, domain, version, start }.
const wfConfig = computed(() => {
  const c = nav.value?.config ?? {};
  const start = (c['start'] as Record<string, unknown> | undefined) ?? {};
  return {
    domain: String(c['domain'] ?? 'morph-idm'),
    name: String(c['key'] ?? nav.value?.key ?? ''),
    version: c['version'] ? String(c['version']) : undefined,
    start,
    // authorization_code login needs PKCE (codeChallenge on login → verifier at redeem).
    pkce: start['grantType'] === 'authorization_code',
    // Some flows key the instance by the logged-in userId + collect a start form.
    keyFrom: c['keyFrom'] ? String(c['keyFrom']) : undefined,
    startFields: (c['startFields'] as { name: string; label?: unknown; type?: string }[] | undefined) ?? undefined,
  };
});

async function onWorkflowSuccess(instanceId: string, extra: { codeVerifier?: string }) {
  if (!wfConfig.value.pkce || !extra.codeVerifier) {
    console.info(`[NavView] workflow ${wfConfig.value.name} success, instance=${instanceId}`);
    return;
  }
  // 2FA login done → redeem the token subflow, then flip the app to 2FA.
  const tokens = await completeLogin(instanceId, extra.codeVerifier);
  if (tokens && setTokenLevel) setTokenLevel('2fa');
}
</script>

<template>
  <div class="navview">
    <template v-if="!nav">
      <p class="muted">Unknown route: {{ props.item.key }}</p>
    </template>

    <!-- dynamicView: pseudo-ui content fetched by key from shell/Views -->
    <PseudoRenderer v-else-if="nav.type === 'dynamicView' && dynView" :view="dynView" :lang="lang" @submit="onSubmit" />
    <div v-else-if="nav.type === 'dynamicView' && loading" class="navview-loading">
      <div class="boot-spinner" />
    </div>

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

    <!-- workflow: drive the backend state machine via workflow-manager + pseudo-ui -->
    <section v-else-if="nav.type === 'workflow'">
      <h2>{{ t(nav.title) || nav.key }}</h2>
      <p v-if="nav.subtitle" class="muted">{{ t(nav.subtitle) }}</p>
      <WorkflowRunner
        :domain="wfConfig.domain"
        :name="wfConfig.name"
        :version="wfConfig.version"
        :start="wfConfig.start"
        :pkce="wfConfig.pkce"
        :key-from="wfConfig.keyFrom"
        :start-fields="wfConfig.startFields"
        :lang="lang"
        @success="onWorkflowSuccess"
      />
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
