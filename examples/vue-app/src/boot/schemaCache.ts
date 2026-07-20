// ─────────────────────────────────────────────────────────────────────────
// Shared schema fetch — resolves published schemas (transition input / view
// data schemas) from the backend by key, cached per session (schemas are
// immutable per key). Used by the x-context-source filter (to resolve input
// bindings) and the workflow driver (to feed each view its transition schema so
// pseudo-ui renders x-labels + validation). One fetch, one cache.
// ─────────────────────────────────────────────────────────────────────────
import { idmFetch } from './idmWorkflow';

/** Pull `attributes` from an instance response (tolerates the wrapped shape). */
function attrsOf(data: unknown): Record<string, unknown> {
  const o = data as { attributes?: Record<string, unknown>; data?: { attributes?: Record<string, unknown> } } | null;
  return o?.attributes ?? o?.data?.attributes ?? {};
}

const schemaCache = new Map<string, Promise<Record<string, unknown> | null>>();

/**
 * Fetch a published schema's JSON-schema body (`attributes.schema`) by key from
 * the domain's sys-schemas flow. Cached; null on failure (never throws).
 */
export function loadSchemaByKey(domain: string, key: string): Promise<Record<string, unknown> | null> {
  const cacheKey = `${domain}:${key}`;
  let p = schemaCache.get(cacheKey);
  if (!p) {
    p = idmFetch(`/${domain}/workflows/sys-schemas/instances/${key}`, { query: { sync: 'true' } })
      .then((r) => (r.ok ? ((attrsOf(r.data).schema as Record<string, unknown>) ?? null) : null))
      .catch(() => null);
    schemaCache.set(cacheKey, p);
  }
  return p;
}

/**
 * A view's `dataSchema` is a URL ref (e.g.
 * "https://vnext.io/schemas/user-login/user-login-credentials.json"); the
 * published schema key is its filename without extension.
 */
export function schemaKeyFromDataSchema(dataSchema: unknown): string | null {
  if (typeof dataSchema !== 'string' || !dataSchema) return null;
  const last = dataSchema.split(/[/\\]/).pop() ?? dataSchema;
  return last.replace(/\.json$/i, '') || null;
}
