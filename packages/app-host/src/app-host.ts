// ─────────────────────────────────────────────────────────────────────────
// createAppHost — the single entry point.
//
//   const host = await createAppHost({ clientId, shellBase }, { fetchJson, ... });
//   host.state          // resolved environment/config/navigation/tokenLevel
//   host.built          // page-router RouteRegistry + homepageKey + itemsByKey
//   host.setTokenLevel  // device → 1FA → 2FA: re-pulls navigation and re-homes
//   host.onChange       // subscribe to re-boots (state + built replaced)
//
// This is orchestration only — no business rules, no views. It composes the
// discovery chain with the route-registry builder and exposes a token-level
// switch so the same machine drives all three auth states.
// ─────────────────────────────────────────────────────────────────────────
import { discover } from './discovery.js';
import { buildRouteRegistry, type BuiltRegistry } from './registry.js';
import type { AppHostConfig, AppHostDeps, AppHostState, NavigationResponse, TokenLevel } from './types.js';

export interface AppHost {
  readonly state: AppHostState;
  readonly built: BuiltRegistry;
  /** Switch auth state (device/1fa/2fa): re-pulls navigation for the new level and rebuilds the registry. */
  setTokenLevel(level: TokenLevel): Promise<void>;
  /** Notified whenever state/built are replaced (initial boot excluded). */
  onChange(listener: (host: AppHost) => void): () => void;
}

export async function createAppHost(config: AppHostConfig, deps: AppHostDeps): Promise<AppHost> {
  let state = await discover(config, deps);
  let built = buildRouteRegistry(state.navigation, state.shellMode);
  const listeners = new Set<(h: AppHost) => void>();

  const host: AppHost = {
    get state() {
      return state;
    },
    get built() {
      return built;
    },
    async setTokenLevel(level: TokenLevel) {
      if (level === state.tokenLevel) return;
      const shellMode: 'sdi' | 'mdi' =
        level === '2fa' && (state.clientConfig.router?.defaultMode ?? 'sdi').toLowerCase() === 'mdi'
          ? 'mdi'
          : 'sdi';
      const navFn = state.clientConfig.navigation?.endpoint?.function ?? 'navigation';
      const raw = await deps.fetchJson(`/functions/${navFn}`, {
        query: { clientId: config.clientId, tokenLevel: level, sync: 'true' },
      });
      const navigation = unwrapNavigation(raw);
      state = { ...state, navigation, tokenLevel: level, shellMode };
      built = buildRouteRegistry(navigation, shellMode);
      for (const l of listeners) l(host);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return host;
}

function unwrapNavigation(raw: unknown): NavigationResponse {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw as Record<string, unknown>);
    const inner = keys.length === 1 ? (raw as Record<string, unknown>)[keys[0]!] : raw;
    return inner as NavigationResponse;
  }
  return raw as NavigationResponse;
}
