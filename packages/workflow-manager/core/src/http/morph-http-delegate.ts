/**
 * Default `HttpDelegate` adapter that wraps `@morph/core`'s `HostClient.request`.
 *
 * Callers construct it with a `MorphClient`, the host key (an entry in
 * `MorphConfig.hosts[]`) and an optional default `authId`; per-request
 * `meta.hostKey` / `meta.authId` overrides are honoured.
 *
 * Behavior notes:
 *  - `MorphResponse.statusCode` → `HttpResponse.status`; `ok = status >= 200 && status < 300 || status === 304`.
 *  - 4xx/5xx are returned as `{ ok: false }`; the adapter never throws on
 *    HTTP-level errors. Lower-level network/timeout failures from `@morph/core`
 *    propagate as thrown errors so the API service can wrap them.
 *  - `query` (including repeat-key arrays) is serialized into the path
 *    query-string before delegation, because `HostRequestOptions.queryParams`
 *    only accepts `Record<string, string>`.
 *  - `timeoutMs` is converted to morph's string format (`"30s"`).
 */

import type { HostClient, MorphClient, MorphResponse } from '@morph/core';
import type { HttpDelegate, HttpRequest, HttpResponse } from '../types.js';

const SUCCESS_RANGE_MIN = 200;
const SUCCESS_RANGE_MAX = 300;

export class MorphHttpDelegate implements HttpDelegate {
  private readonly morphClient: MorphClient;
  private readonly defaultHostKey: string;
  private readonly defaultAuthId?: string;

  constructor(morphClient: MorphClient, hostKey: string, authId?: string) {
    this.morphClient = morphClient;
    this.defaultHostKey = hostKey;
    if (authId !== undefined) this.defaultAuthId = authId;
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const hostKey = (req.meta?.hostKey as string | undefined) ?? this.defaultHostKey;
    const authId = (req.meta?.authId as string | undefined) ?? this.defaultAuthId;

    const host = this.morphClient.host(hostKey) as HostClient;

    const path = appendQueryToPath(req.path, req.query);

    const morphResponse = (await host.request({
      method: req.method,
      path,
      ...(req.body !== undefined ? { body: req.body } : {}),
      ...(req.headers ? { headers: req.headers } : {}),
      ...(authId !== undefined ? { auth: authId } : {}),
      ...(req.timeoutMs !== undefined && req.timeoutMs > 0
        ? { timeout: `${Math.round(req.timeoutMs)}ms` }
        : {}),
    })) as MorphResponse<T>;

    return toHttpResponse<T>(morphResponse);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toHttpResponse<T>(morphResponse: MorphResponse<T>): HttpResponse<T> {
  const status = morphResponse.statusCode;
  const ok = (status >= SUCCESS_RANGE_MIN && status < SUCCESS_RANGE_MAX) || status === 304;
  return {
    ok,
    status,
    headers: morphResponse.headers ?? {},
    data: morphResponse.body ?? null,
  };
}

/**
 * Append SDK-side query parameters to the host-relative path. Skips `undefined`
 * values; serialises arrays as repeat-key (`?ext=a&ext=b`); URI-encodes both
 * keys and values.
 */
export function appendQueryToPath(
  path: string,
  query: HttpRequest['query'] | undefined,
): string {
  if (!query) return path;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  if (parts.length === 0) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}${parts.join('&')}`;
}
