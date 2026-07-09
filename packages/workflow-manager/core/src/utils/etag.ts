/**
 * Helpers for the two-tier ETag mechanism (snapshot + entity).
 * Header is the source of truth (RFC 7230, case-insensitive); body is fallback
 * for older runtime versions.
 */

import type { HttpResponse } from '../types.js';

export interface PickedETags {
  /** Snapshot/function-level ETag — used for `If-None-Match`. */
  eTag?: string;
  /** Entity-level ETag — concurrency / informational. */
  entityEtag?: string;
}

/**
 * Pick both ETags from a response, preferring HTTP headers. Body fallback
 * keys: `eTag` (canonical camelCase) and `etag` (legacy lowercase).
 */
export function pickETags<T>(response: HttpResponse<T>): PickedETags {
  const headers = response.headers ?? {};
  const headerEtag = headerLookup(headers, 'etag');
  const headerEntity = headerLookup(headers, 'x-entity-etag');

  let bodyEtag: string | undefined;
  let bodyEntity: string | undefined;
  const data = response.data as Record<string, unknown> | null;
  if (data && typeof data === 'object') {
    bodyEtag = stringOr(data['eTag'], stringOr(data['etag']));
    bodyEntity = stringOr(data['entityEtag'], stringOr(data['entityETag']));
  }

  const out: PickedETags = {};
  const eTag = headerEtag ?? bodyEtag;
  const entityEtag = headerEntity ?? bodyEntity;
  if (eTag !== undefined) out.eTag = eTag;
  if (entityEtag !== undefined) out.entityEtag = entityEtag;
  return out;
}

/** Apply `If-None-Match: <eTag>` if present. Returns a new headers object. */
export function withIfNoneMatch(
  headers: Record<string, string> | undefined,
  eTag: string | undefined,
): Record<string, string> | undefined {
  if (!eTag) return headers;
  return { ...(headers ?? {}), 'If-None-Match': eTag };
}

export function is304(response: HttpResponse<unknown>): boolean {
  return response.status === 304;
}

// ----------------------------------------------------------------------------

function headerLookup(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      const v = headers[key];
      return v ?? undefined;
    }
  }
  return undefined;
}

function stringOr(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}
