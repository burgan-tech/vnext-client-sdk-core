import type { RouteLifetime } from '../enums.js';
import type {
  NavigationItem,
  RouteDefinition,
  RouteInput,
} from '../types.js';
import type { Logger } from './logger.js';
import { resolveLocalized } from './localized.js';

export interface ResolvedDataEntry {
  name: string;
  value: unknown;
  origin: 'extraData' | 'default' | 'missing';
}

export type ResolvePayloadResult =
  | { ok: true; payload: Record<string, unknown>; resolvedData: ResolvedDataEntry[] }
  | { ok: false; reason: 'missing-required-input'; missing: string[] };

export interface ResolveContext {
  routeKey: string;
  logger?: Logger;
}

/**
 * `RouteInput` kontratını `request.extraData` + `RouteInput.default` ile birleştirir.
 *
 * Resolution sırası (her input için):
 *
 *   1. `extraData[name] !== undefined` → `origin: 'extraData'`
 *   2. `RouteInput.default !== undefined` → `origin: 'default'`
 *   3. `RouteInput.required === true` → cancellation toplanır.
 *   4. Aksi halde `payload[name] = undefined`, `origin: 'missing'`,
 *      `onLog.debug('input-missing', …)`.
 *
 * `extraData` içinde declared olmayan key'ler "esnek pass-through" olarak
 * payload'a olduğu gibi eklenir + `onLog.debug('undeclared-input', …)`.
 */
export function resolveRoutePayload(
  inputs: RouteInput[] | undefined,
  extraData: Record<string, unknown> | undefined,
  ctx: ResolveContext,
): ResolvePayloadResult {
  const payload: Record<string, unknown> = {};
  const resolvedData: ResolvedDataEntry[] = [];
  const missing: string[] = [];
  const declaredNames = new Set<string>();

  for (const input of inputs ?? []) {
    declaredNames.add(input.name);
    const fromExtra =
      extraData && Object.prototype.hasOwnProperty.call(extraData, input.name)
        ? extraData[input.name]
        : undefined;

    if (fromExtra !== undefined) {
      payload[input.name] = fromExtra;
      resolvedData.push({ name: input.name, value: fromExtra, origin: 'extraData' });
      continue;
    }

    if (input.default !== undefined) {
      payload[input.name] = input.default;
      resolvedData.push({
        name: input.name,
        value: input.default,
        origin: 'default',
      });
      continue;
    }

    if (input.required === true) {
      missing.push(input.name);
      continue;
    }

    payload[input.name] = undefined;
    resolvedData.push({ name: input.name, value: undefined, origin: 'missing' });
    ctx.logger?.debug('input-missing', undefined, {
      routeKey: ctx.routeKey,
      name: input.name,
    });
  }

  if (missing.length > 0) {
    ctx.logger?.warn('missing-required-input', undefined, {
      routeKey: ctx.routeKey,
      missing,
    });
    return { ok: false, reason: 'missing-required-input', missing };
  }

  if (extraData) {
    for (const key of Object.keys(extraData)) {
      if (declaredNames.has(key)) continue;
      payload[key] = extraData[key];
      ctx.logger?.debug('undeclared-input', undefined, {
        routeKey: ctx.routeKey,
        name: key,
      });
    }
  }

  return { ok: true, payload, resolvedData };
}

// ---------------------------------------------------------------------------
// NavigationItem builder
// ---------------------------------------------------------------------------

export interface BuildNavigationItemArgs {
  route: RouteDefinition;
  payload: Record<string, unknown>;
  resolvedData: ResolvedDataEntry[];
  locale: string;
  fallbackLocale?: string;
  defaultLifetime: RouteLifetime;
  logger?: Logger;
}

/**
 * `RouteDefinition` + resolved payload + locale snapshot'ından runtime
 * `NavigationItem` üretir. `config` opaque referansı pass-through; title/subtitle
 * locale seçim + `{{name}}` interpolasyonu sonrası düz string olur.
 */
export function buildNavigationItem(args: BuildNavigationItemArgs): NavigationItem {
  const { route, payload, resolvedData, locale, fallbackLocale, defaultLifetime, logger } =
    args;

  const localeCtx = {
    locale,
    ...(fallbackLocale !== undefined ? { fallbackLocale } : {}),
    ...(logger !== undefined ? { logger } : {}),
    routeKey: route.key,
  };

  const title = resolveLocalized(route.defaultTitle, payload, localeCtx);
  const subtitle = resolveLocalized(route.defaultSubtitle, payload, localeCtx);

  const item: NavigationItem = {
    key: route.key,
    lifetime: route.lifetime ?? defaultLifetime,
    config: route.config,
    resolvedData: [...resolvedData],
    locale,
  };
  if (title !== undefined) item.title = title;
  if (subtitle !== undefined) item.subtitle = subtitle;
  return item;
}
