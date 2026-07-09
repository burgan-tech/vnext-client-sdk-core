// ─────────────────────────────────────────────────────────────────────────
// page-router SDK — the application shell backbone.
//
// createPageRouter() owns navigation + the open-view lifecycle. Each route key
// maps to a Vue component via createVueSurfaceFactory; <PageRouterShell> renders
// the active view. The router itself fetches nothing — the host owns the
// routeKey → component mapping (the seam that lets page-router drive any view,
// including pseudo-ui / workflow views).
// ─────────────────────────────────────────────────────────────────────────
import { createPageRouter, type IPageRouter, type RouteRegistry } from 'page-router';
import { createVueSurfaceFactory } from 'page-router-vue';
import type { Component } from 'vue';

import HomeView from '../views/HomeView.vue';
import PseudoFormView from '../views/PseudoFormView.vue';
import WorkflowView from '../views/WorkflowView.vue';
import MorphView from '../views/MorphView.vue';
import ContextView from '../views/ContextView.vue';
import ClientsView from '../views/ClientsView.vue';
import ClientDetailView from '../views/ClientDetailView.vue';

export interface NavItem {
  key: string;
  label: string;
  icon: string;
}

/** Sidebar navigation — also the source of the sidebar route registry. */
export const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'pi pi-home' },
  { key: 'clients', label: 'Clients (IDM)', icon: 'pi pi-id-card' },
  { key: 'workflow', label: 'Workflow (IbWeb)', icon: 'pi pi-sitemap' },
  { key: 'pseudo-form', label: 'Pseudo-UI Form', icon: 'pi pi-th-large' },
  { key: 'morph', label: 'Morph API', icon: 'pi pi-cloud' },
  { key: 'context', label: 'Context Store', icon: 'pi pi-database' },
];

const COMPONENTS: Record<string, Component> = {
  home: HomeView,
  clients: ClientsView,
  'client-detail': ClientDetailView,
  workflow: WorkflowView,
  'pseudo-form': PseudoFormView,
  morph: MorphView,
  context: ContextView,
};

// Built as a plain object and cast to RouteRegistry — the config enum-ish
// fields ('sdi', 'singleton', …) are the same string values the SDK accepts
// from JSON registries; this mirrors the upstream sample's `as RouteRegistry`.
const registry = {
  config: {
    shellMode: 'sdi',
    locale: 'en',
    fallbackLocale: 'en',
    defaultLifetime: 'singleton',
    defaultShellModeOnConflict: 'cancel',
  },
  routes: [
    ...NAV.map((n) => ({
      key: n.key,
      lifetime: 'singleton',
      defaultTitle: n.label,
      config: {},
    })),
    // Detail route — not in the sidebar; opened from the Clients list with a
    // required `instanceKey` input (projected into the view's props).
    {
      key: 'client-detail',
      lifetime: 'transient',
      defaultTitle: 'Client detail',
      config: {},
      inputs: [{ name: 'instanceKey', required: true }],
    },
  ],
} as unknown as RouteRegistry;

// Module singleton so views can trigger navigation without prop-drilling the
// router (set on boot; read via getRouter()).
let routerInstance: IPageRouter | null = null;

export function getRouter(): IPageRouter {
  if (!routerInstance) throw new Error('page-router not booted yet');
  return routerInstance;
}

export async function bootRouter(): Promise<IPageRouter> {
  const router = await createPageRouter({
    routeRegistry: registry,
    onEvaluate: async ({ item }) => [item],
    onNavigate: async () => undefined,
    createViewSurface: createVueSurfaceFactory((routeKey) => COMPONENTS[routeKey] ?? null),
    disposeViewSurface: async () => undefined,
    onLog: (level, code) => {
      // eslint-disable-next-line no-console
      console.debug(`%c[page-router] ${level}: ${code}`, 'color:#c60');
    },
  });

  routerInstance = router;
  await router.navigate({ routeKey: 'home' });
  return router;
}
