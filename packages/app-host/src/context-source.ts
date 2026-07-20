// ─────────────────────────────────────────────────────────────────────────
// x-context-source resolver — the READER side that consumes the backend schema
// annotations. Given a JSON schema (a transition input schema) and readers over
// the client's context-store, it builds the partial `attributes` object for the
// values the client already holds — so a generic client wires NO per-flow inputs.
//
// A property with `x-context-source` is client-resolved (never user input); a
// property without one is left out (user input / form field). Nested objects are
// walked recursively, so annotations on `deviceInfo.osName` etc. build the nested
// shape. Pairs with the writer side (context providers) + the x-context-target
// applier. Platform-agnostic (parity: Dart/Swift/Kotlin) — pure data in/out.
// ─────────────────────────────────────────────────────────────────────────

import type { ContextBoundary } from './context-providers.js';

/** The three binding forms an `x-context-source` value can take. */
export type ContextSourceBinding =
  | { const: unknown }
  | { context: { boundary: ContextBoundary; key: string; storage?: string } }
  | { identity: 'subject' | 'user' };

/** Minimal JSON-schema view this resolver walks. */
export interface SourceSchema {
  type?: string;
  properties?: Record<string, SourceSchema & { 'x-context-source'?: ContextSourceBinding }>;
  [k: string]: unknown;
}

/** Host-supplied reads over the context-store (keeps this module store-free). */
export interface ContextSourceReaders {
  /** Read a context-store value (boundary + key). Storage tier is the host's
   * concern (ambient values live in memory); an optional `storage` hint is passed
   * through from the binding when present. */
  readContext(boundary: ContextBoundary, key: string, storage?: string): unknown;
  /** Read a context-store identity: 'subject' (customer/scope) or 'user' (actor). */
  readIdentity(kind: 'subject' | 'user'): string | null;
}

function resolveBinding(binding: ContextSourceBinding, readers: ContextSourceReaders): unknown {
  if ('const' in binding) return binding.const;
  if ('context' in binding) return readers.readContext(binding.context.boundary, binding.context.key, binding.context.storage);
  if ('identity' in binding) return readers.readIdentity(binding.identity);
  return undefined;
}

/**
 * Walk `schema.properties` and build a partial object of every value bound via
 * `x-context-source`, recursing into nested object properties. Only defined
 * (resolvable) values are included; a nested object is included only when it has
 * at least one resolved child. The caller merges this with any explicit body.
 */
export function resolveContextSource(schema: SourceSchema | null | undefined, readers: ContextSourceReaders): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return out;

  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== 'object') continue;
    const binding = prop['x-context-source'];
    if (binding) {
      const value = resolveBinding(binding, readers);
      if (value !== undefined) out[name] = value;
      continue;
    }
    // No binding on this property — recurse into nested objects so annotations on
    // sub-properties (e.g. deviceInfo.osName) still build the nested shape.
    if (prop.type === 'object' && prop.properties) {
      const nested = resolveContextSource(prop, readers);
      if (Object.keys(nested).length > 0) out[name] = nested;
    }
  }
  return out;
}
