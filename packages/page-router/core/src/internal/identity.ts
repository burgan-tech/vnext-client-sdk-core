import type { NavigationItem, OpenOverlay } from '../types.js';
import type { Logger } from './logger.js';

/**
 * "Primitive" definition for identity matching purposes (spec → "Singleton
 * Identity"): `string | number | boolean | bigint | null`. `undefined` is
 * treated as missing-value (fail-closed); `symbol` and any object/array
 * variants count as non-primitive and are ignored in identity comparisons.
 */
function isPrimitive(v: unknown): boolean {
  if (v === null) return true;
  const t = typeof v;
  return t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint';
}

export interface FilterOptions {
  /**
   * Distinguishes the warn topics for the two callers of this primitive
   * (singleton identity vs. findTabs/findOverlays query filter).
   */
  mode: 'singleton' | 'find';
  logger?: Logger;
  /** Loglama context'i; opsiyonel. */
  routeKey?: string;
}

/**
 * Returns true when **every** target primitive field exists with strict
 * equality on the candidate payload. Non-primitive target fields are skipped
 * (with a warn). A target field whose value is `undefined` short-circuits to
 * `false` (with a warn) — both for singleton identity (transient fallback)
 * and for findTabs/findOverlays semantics (AND-reduction over query fields).
 */
export function matchesPrimitiveFilter(
  candidatePayload: Record<string, unknown>,
  targetPayload: Record<string, unknown>,
  fieldNames: ReadonlyArray<string>,
  opts: FilterOptions,
): boolean {
  for (const name of fieldNames) {
    const targetVal = targetPayload[name];

    if (targetVal === undefined) {
      opts.logger?.warn(
        opts.mode === 'singleton'
          ? 'singleton-key-missing-value'
          : 'find-key-missing-value',
        undefined,
        { routeKey: opts.routeKey, name },
      );
      return false;
    }

    if (!isPrimitive(targetVal)) {
      opts.logger?.warn(
        opts.mode === 'singleton'
          ? 'singleton-key-non-primitive'
          : 'find-key-non-primitive',
        undefined,
        { routeKey: opts.routeKey, name, type: typeof targetVal },
      );
      continue;
    }

    if (candidatePayload[name] !== targetVal) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Singleton identity match
// ---------------------------------------------------------------------------

export interface SingletonTarget {
  routeKey: string;
  /** May be empty → routeKey-only matching (the first candidate wins). */
  singletonKey: ReadonlyArray<string>;
  payload: Record<string, unknown>;
}

export interface SingletonMatchOptions {
  logger?: Logger;
}

/**
 * Locates a singleton tab matching `target` identity, or returns `null` to
 * signal "transient fallback" (i.e. caller should open a new tab).
 *
 * Behaviour (spec → "Singleton Identity"):
 *
 * - `target.singletonKey` empty / no field declared → match by routeKey only;
 *   the first routeKey-matching tab is returned.
 * - Any singleton field whose target value is `undefined` → warn
 *   `singleton-key-missing-value` and return `null` (transient fallback).
 * - Any singleton field whose target value is non-primitive → warn
 *   `singleton-key-non-primitive` and **ignore** that field for identity
 *   (so a non-primitive-only key still matches by routeKey).
 * - Among routeKey-matching candidates, the **first** payload that satisfies
 *   strict primitive equality on every remaining singleton field is returned.
 */
export function findSingletonMatch<T extends IdentityHolder>(
  candidates: ReadonlyArray<T>,
  target: SingletonTarget,
  opts: SingletonMatchOptions = {},
): T | null {
  const byRoute = candidates.filter((c) => c.item.key === target.routeKey);
  if (byRoute.length === 0) return null;

  // First validate target payload against missing-value (fail-closed). This
  // emits the warn exactly once per call rather than once per candidate.
  for (const name of target.singletonKey) {
    if (target.payload[name] === undefined) {
      opts.logger?.warn('singleton-key-missing-value', undefined, {
        routeKey: target.routeKey,
        name,
      });
      return null;
    }
  }

  for (const cand of byRoute) {
    const opts2: FilterOptions = {
      mode: 'singleton',
      routeKey: target.routeKey,
      ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
    };
    if (
      matchesPrimitiveFilter(cand.payload, target.payload, target.singletonKey, opts2)
    ) {
      return cand;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// findTabs / findOverlays query filter
// ---------------------------------------------------------------------------

/** Anything that exposes `{ item: { key }, payload }` — covers `OpenTab` & `OpenOverlay`. */
export interface IdentityHolder {
  readonly item: Pick<NavigationItem, 'key'>;
  readonly payload: Record<string, unknown>;
}

export interface PayloadQuery {
  routeKey: string;
  payload?: Record<string, unknown>;
}

export interface PayloadQueryOptions {
  logger?: Logger;
}

/**
 * `findTabs` / `findOverlays` semantics: filter holders by `routeKey` then,
 * if `query.payload` is supplied, AND-reduce strict primitive equality on
 * every field. Non-primitive query fields are ignored (warn). Missing query
 * field shortcuts that holder out (warn). Symmetric for tabs and overlays.
 */
export function matchPayloadQuery<T extends IdentityHolder>(
  holders: ReadonlyArray<T>,
  query: PayloadQuery,
  opts: PayloadQueryOptions = {},
): T[] {
  const byRoute = holders.filter((h) => h.item.key === query.routeKey);
  if (!query.payload) return byRoute;

  const fieldNames = Object.keys(query.payload);
  if (fieldNames.length === 0) return byRoute;

  const filterOpts: FilterOptions = {
    mode: 'find',
    routeKey: query.routeKey,
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  };
  return byRoute.filter((h) =>
    matchesPrimitiveFilter(h.payload, query.payload!, fieldNames, filterOpts),
  );
}

// Re-export for consumers that already imported OpenOverlay from types.
export type { OpenOverlay };
