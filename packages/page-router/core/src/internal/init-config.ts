import { RouteLifetime } from '../enums.js';
import type { ShellMode, ShellModeConflictPolicy } from '../enums.js';
import type { PageRouterOptions, RouteRegistryConfig } from '../types.js';

export interface ResolvedInitConfig {
  shellMode: ShellMode;
  locale: string;
  fallbackLocale?: string;
  defaultLifetime: RouteLifetime;
  defaultShellModeOnConflict: ShellModeConflictPolicy;
}

export type InitConfigResult =
  | { ok: true; config: ResolvedInitConfig }
  | { ok: false; code: 'init-config-missing'; missing: string[] };

/**
 * Merges code-side `PageRouterOptions` with the optional JSON-side
 * `RouteRegistry.config`. Precedence (spec → "Config-oriented boot"):
 *
 *     code  >  JSON  >  SDK defaults
 *
 * SDK defaults applied per-field:
 *
 * - `defaultLifetime = RouteLifetime.singleton`
 * - `defaultShellModeOnConflict = 'cancel'`
 *
 * Returns `init-config-missing` failure when neither side supplies `shellMode`
 * or `locale` (the two fields that have no SDK default and must be explicit).
 */
export function mergeInitConfig(
  options: Pick<
    PageRouterOptions,
    | 'shellMode'
    | 'locale'
    | 'fallbackLocale'
    | 'defaultLifetime'
    | 'defaultShellModeOnConflict'
  >,
  jsonConfig: RouteRegistryConfig | undefined,
): InitConfigResult {
  const shellMode = options.shellMode ?? jsonConfig?.shellMode;
  const locale = options.locale ?? jsonConfig?.locale;
  const fallbackLocale = options.fallbackLocale ?? jsonConfig?.fallbackLocale;
  const defaultLifetime =
    options.defaultLifetime ?? jsonConfig?.defaultLifetime ?? RouteLifetime.singleton;
  const defaultShellModeOnConflict =
    options.defaultShellModeOnConflict ??
    jsonConfig?.defaultShellModeOnConflict ??
    'cancel';

  const missing: string[] = [];
  if (!shellMode) missing.push('shellMode');
  if (!locale) missing.push('locale');
  if (missing.length > 0) {
    return { ok: false, code: 'init-config-missing', missing };
  }

  return {
    ok: true,
    config: {
      shellMode: shellMode as ShellMode,
      locale: locale as string,
      ...(fallbackLocale !== undefined ? { fallbackLocale } : {}),
      defaultLifetime,
      defaultShellModeOnConflict,
    },
  };
}
