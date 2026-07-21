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

export interface LocaleConfig {
  /** Initial UI locale (users switch at runtime via the profile menu). */
  locale?: string;
  /** Locale used when a label lacks the active locale. */
  fallbackLocale?: string;
}

export function buildRouteRegistry(
  navigation: NavigationResponse,
  shellMode: 'sdi' | 'mdi',
  localeConfig: LocaleConfig = {},
): BuiltRegistry {
  // Both nav records are routable: the sidebar content AND the profile-dropdown
  // actions (e.g. login) each become routes.
  const flat = flatten([...navigation.sidebar, ...navigation.profile]);
  const itemsByKey = new Map<string, NavItem>();
  for (const item of flat) itemsByKey.set(item.key!, item);

  const routes = flat.map((item) => {
    // A nav item may declare tab identity in its config: `singletonKey` (payload
    // fields that distinguish tabs — e.g. ["deviceId"] so each drill-down opens
    // its own tab) and `lifetime`. Both are optional and default to a plain
    // singleton (one tab per route key).
    const cfg = (item.config ?? {}) as Record<string, unknown>;
    const singletonKey = Array.isArray(cfg.singletonKey)
      ? (cfg.singletonKey as string[])
      : undefined;
    return {
      key: item.key!,
      lifetime: (typeof cfg.lifetime === 'string' ? cfg.lifetime : 'singleton') as string,
      ...(singletonKey ? { singletonKey } : {}),
      defaultTitle: item.title ?? item.key!,
      // `tabSubtitle` is a template (e.g. "{{deviceId}}") the router interpolates
      // from the tab payload — a second line that tells same-titled tabs apart.
      ...(cfg.tabSubtitle !== undefined ? { defaultSubtitle: cfg.tabSubtitle } : {}),
      config: { navItem: item },
    };
  });

  const registry = {
    config: {
      shellMode,
      // Initial UI locale from client-config (i18n.default); users switch at
      // runtime via the profile menu. Falls back to 'en' pre-config.
      locale: localeConfig.locale ?? 'en',
      fallbackLocale: localeConfig.fallbackLocale ?? localeConfig.locale ?? 'en',
      defaultLifetime: 'singleton',
      defaultShellModeOnConflict: 'cancel',
    },
    routes,
  } as unknown as RouteRegistry;

  return { registry, homepageKey: navigation.homepage, itemsByKey };
}
