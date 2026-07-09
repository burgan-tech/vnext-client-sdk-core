import type { LocalizedString } from '../types.js';
import type { Logger } from './logger.js';

export interface LocaleContext {
  locale: string;
  fallbackLocale?: string;
  logger?: Logger;
  /** Loglama context'ine girer; opsiyonel. */
  routeKey?: string;
}

/**
 * `LocalizedString`'ten aktif locale'e karşılık gelen düz string'i seçer.
 *
 * Fallback zinciri (spec → "Localization → Locale seçim"):
 *   1. `ctx.locale`
 *   2. `ctx.fallbackLocale` (varsa)
 *   3. Map'in ilk key'i (insertion order)
 *   4. `""` + `onLog.warn('locale-fallback-empty', …)`
 *
 * Plain string input locale fark etmeksizin aynen döner.
 */
export function pickLocaleString(value: LocalizedString, ctx: LocaleContext): string {
  if (typeof value === 'string') {
    return value;
  }

  const map = value;
  const direct = map[ctx.locale];
  if (typeof direct === 'string') return direct;

  if (ctx.fallbackLocale) {
    const fallback = map[ctx.fallbackLocale];
    if (typeof fallback === 'string') return fallback;
  }

  const keys = Object.keys(map);
  const firstKey = keys[0];
  if (firstKey !== undefined) {
    const first = map[firstKey];
    if (typeof first === 'string') return first;
  }

  ctx.logger?.warn('locale-fallback-empty', undefined, {
    routeKey: ctx.routeKey,
    locale: ctx.locale,
    fallbackLocale: ctx.fallbackLocale,
    availableKeys: keys,
  });
  return '';
}

const PLACEHOLDER_RE = /\{\{([^{}]+)\}\}/g;
// Flat keys only: alphanumerics + `_` + `-`. Nested paths / format specs are
// intentionally NOT supported (spec → "Template interpolasyonu").
const FLAT_KEY_RE = /^[A-Za-z_][\w-]*$/;

export interface InterpolateContext {
  logger?: Logger;
  routeKey?: string;
}

/**
 * `{{name}}` placeholder'larını `payload`'dan doldurur.
 *
 * - Flat key only: `{{user.name}}`, `{{amount:currency}}` literal kalır + warn.
 * - Eksik / `null` / `undefined` value: literal kalır + warn `template-key-not-found`.
 * - Primitive değer (`number`/`boolean`/`bigint`) `String(value)` ile cast.
 */
export function interpolateTemplate(
  template: string,
  payload: Record<string, unknown>,
  ctx: InterpolateContext = {},
): string {
  return template.replace(PLACEHOLDER_RE, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (!FLAT_KEY_RE.test(key)) {
      warnMissing(ctx, key, match);
      return match;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      warnMissing(ctx, key, match);
      return match;
    }
    const value = payload[key];
    if (value === null || value === undefined) {
      warnMissing(ctx, key, match);
      return match;
    }
    return String(value);
  });
}

function warnMissing(ctx: InterpolateContext, key: string, placeholder: string): void {
  ctx.logger?.warn('template-key-not-found', undefined, {
    routeKey: ctx.routeKey,
    key,
    placeholder,
  });
}

/**
 * `pickLocaleString` + `interpolateTemplate` zinciri. `value` undefined ise
 * undefined döner.
 */
export function resolveLocalized(
  value: LocalizedString | undefined,
  payload: Record<string, unknown>,
  ctx: LocaleContext,
): string | undefined {
  if (value === undefined) return undefined;
  const picked = pickLocaleString(value, ctx);
  return interpolateTemplate(picked, payload, {
    ...(ctx.logger !== undefined ? { logger: ctx.logger } : {}),
    ...(ctx.routeKey !== undefined ? { routeKey: ctx.routeKey } : {}),
  });
}
