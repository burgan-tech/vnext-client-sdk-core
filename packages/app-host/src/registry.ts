// ─────────────────────────────────────────────────────────────────────────
// navigation → page-router RouteRegistry.
//
// Each navigation item that carries a `key` becomes a route (group children are
// flattened in too). The original NavItem is stashed in the route's opaque
// `config.navItem` so the host's createViewSurface can render it by type.
// Dividers (no key) are dropped.
// ─────────────────────────────────────────────────────────────────────────
import type { RouteRegistry } from 'page-router';
import type { NavItem, NavigationResponse } from './types.js';

export interface BuiltRegistry {
  registry: RouteRegistry;
  homepageKey: string;
  /** key → NavItem, for the view surface to resolve how to render each route. */
  itemsByKey: Map<string, NavItem>;
}

function flatten(items: NavItem[], out: NavItem[] = []): NavItem[] {
  for (const item of items) {
    if (item.key) out.push(item);
    if (item.children?.length) flatten(item.children, out);
  }
  return out;
}

export function buildRouteRegistry(
  navigation: NavigationResponse,
  shellMode: 'sdi' | 'mdi',
): BuiltRegistry {
  const flat = flatten(navigation.items);
  const itemsByKey = new Map<string, NavItem>();
  for (const item of flat) itemsByKey.set(item.key!, item);

  const routes = flat.map((item) => ({
    key: item.key!,
    lifetime: 'singleton',
    defaultTitle: item.title ?? item.key!,
    config: { navItem: item },
  }));

  const registry = {
    config: {
      shellMode,
      locale: 'tr',
      fallbackLocale: 'en',
      defaultLifetime: 'singleton',
      defaultShellModeOnConflict: 'cancel',
    },
    routes,
  } as unknown as RouteRegistry;

  return { registry, homepageKey: navigation.homepage, itemsByKey };
}
