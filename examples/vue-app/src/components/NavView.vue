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
import { queryInstances } from '../boot/instanceQuery';
import { getWorkflowStates } from '../boot/workflowStates';
import { getTransitionHistory } from '../boot/transitionHistory';
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

// This surface's tab payload. The shell mounts only the ACTIVE tab's surface
// (keyed by tabKey), so the active tab is always this NavView's own tab — a
// drill-down navigates here with `{ filter, … }` and we read it back here.
const payload = computed<Record<string, unknown>>(
  () => (routerState?.activeTab.value?.payload ?? {}) as Record<string, unknown>,
);

function go(key?: string, navPayload?: Record<string, unknown>) {
  // page-router carries navigation params as `extraData` (undeclared keys pass
  // through to the tab payload); it has no `payload` field on the request.
  if (key && router) void router.navigate({ routeKey: key, ...(navPayload ? { extraData: navPayload } : {}) });
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
// → a titled Column with a WorkflowView node pseudo-ui renders and drives via
// delegate.driveWorkflow. Title/subtitle come from instance data (no host chrome).
function workflowView(n: NavItem): ViewDefinition {
  const c = n.config ?? {};
  return {
    view: {
      type: 'Column',
      gap: 'md',
      children: [
        { type: 'Text', variant: 'title', content: '$instance.title' },
        { type: 'Text', variant: 'caption', content: '$instance.subtitle', visible: '$instance.subtitle' },
        {
          type: 'WorkflowView',
          domain: String(c['domain'] ?? ''),
          name: String(c['key'] ?? n.key ?? ''),
          ...(c['version'] ? { version: String(c['version']) } : {}),
          ...(c['keyFrom'] ? { keyFrom: String(c['keyFrom']) } : {}),
          ...(c['start'] ? { start: c['start'] as Record<string, unknown> } : {}),
          ...(c['startFields'] ? { startFields: c['startFields'] } : {}),
        },
      ],
    },
  } as unknown as ViewDefinition;
}

// A group renders its children as a backend-shaped view: a title/subtitle plus
// the generic Navigation list (which emits `navigate`). Titles are localized
// here (the core [{language,label}] form) and passed as instance data, so the
// view stays free of static content.
const children = computed<NavItem[]>(() => nav.value?.children ?? []);
const GROUP_VIEW = {
  view: {
    type: 'Column',
    gap: 'md',
    children: [
      { type: 'Text', variant: 'title', content: '$instance.title' },
      { type: 'Text', variant: 'caption', content: '$instance.subtitle', visible: '$instance.subtitle' },
      { type: 'Navigation', items: '$instance.items' },
    ],
  },
} as unknown as ViewDefinition;

const viewDef = computed<ViewDefinition | null>(() => {
  const n = nav.value;
  if (!n) return null;
  if (n.type === 'dynamicView') return dynView.value;
  if (n.type === 'workflow') return workflowView(n);
  if (n.type === 'group') return GROUP_VIEW;
  return null;
});

// Full-page views (backend `display: "full-page"`, e.g. list tables) drop the
// reading-width cap and use the full content area; forms/nav stay narrow.
const isFullPage = computed(
  () => (viewDef.value as { display?: unknown } | null)?.display === 'full-page',
);

// Instance data fed to the rendered view: localized title/subtitle (workflow +
// group headers) and the child items (group). For a dynamicView it carries the
// tab payload — a drill-down's `filter` reaches the InstanceList this way and is
// shown as a seeded, visible column filter.
const instanceData = computed<Record<string, unknown>>(() => {
  const n = nav.value;
  if (!n) return {};
  if (n.type === 'group') {
    return { title: t(n.title), subtitle: n.subtitle ? t(n.subtitle) : '', items: children.value };
  }
  if (n.type === 'workflow') {
    return { title: t(n.title) || n.key, subtitle: n.subtitle ? t(n.subtitle) : '' };
  }
  if (n.type === 'dynamicView') return { ...payload.value };
  return {};
});

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
  // Paged instance listing for InstanceList nodes (read-only). A drill-down's
  // filter travels via this surface's instanceData (see below) and is seeded as
  // a visible column filter by the list itself.
  queryInstances,
  // Selectable states for a `state`-type column filter (read off the workflow def).
  getWorkflowStates,
  // Transition history for the list row menu's History item.
  getTransitionHistory,
  async onAction(action, data, command) {
    // Navigation taps (e.g. a group's children, or a row-action drill-down that
    // carries a filter payload).
    if (action === 'navigate') {
      const d = data as { key?: string; payload?: Record<string, unknown> } | undefined;
      go(d?.key, d?.payload);
      return;
    }
    if (action !== 'submit') return;
    // pseudo-ui button `command` convention: urn:shell:navigate:<type>:<key>
    const m = /^urn:shell:navigate:[^:]+:(.+)$/.exec(command ?? '');
    if (m) go(m[1]);
  },
  onLog: (level, message) => console.debug(`%c[pseudo-ui] ${level}: ${message}`, 'color:#06c'),
};
</script>

<template>
  <div class="navview" :class="{ 'navview--full': isFullPage }">
    <!-- Every routable nav type (dynamicView / workflow / group) normalizes to a
         single ViewDefinition rendered through one PseudoView + delegate. -->
    <p v-if="!nav" class="muted">Unknown route: {{ props.item.key }}</p>

    <PseudoView
      v-else-if="viewDef"
      :schema="{ type: 'object', properties: {} }"
      :view="viewDef"
      :form-data="{}"
      :instance-data="instanceData"
      :lang="lang"
      :delegate="delegate"
    />

    <div v-else-if="loading" class="navview-loading">
      <div class="boot-spinner" />
    </div>

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
.navview--full { max-width: none; }
.navview-loading { display: flex; justify-content: center; padding: 3rem 0; }
.muted { color: var(--muted, #667); }
h2 { margin: 0 0 .25rem; }
.cfg { font-size: .75rem; background: var(--hover, #f4f4f8); padding: .75rem; border-radius: 8px; overflow: auto; }
</style>
