/**
 * Test-side `HttpDelegate` that records every request and returns scripted
 * responses. Designed for fast, deterministic integration tests.
 *
 * Use the queue-style `enqueue()` to script responses in order, or `route()`
 * to return a payload whenever a path matches a regex/string predicate.
 */

import type { HttpDelegate, HttpRequest, HttpResponse } from '../../src/types.js';

interface QueuedResponse {
  match?: (req: HttpRequest) => boolean;
  response: Partial<HttpResponse<unknown>>;
}

export class MockHttpDelegate implements HttpDelegate {
  readonly calls: HttpRequest[] = [];
  private readonly queue: QueuedResponse[] = [];
  private fallback: Partial<HttpResponse<unknown>> = {
    ok: false,
    status: 500,
    headers: {},
    data: { detail: 'no mock response queued' },
  };

  enqueue(response: Partial<HttpResponse<unknown>>, opts?: { match?: (req: HttpRequest) => boolean }): this {
    this.queue.push({ response, ...(opts?.match ? { match: opts.match } : {}) });
    return this;
  }

  setFallback(response: Partial<HttpResponse<unknown>>): this {
    this.fallback = response;
    return this;
  }

  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    this.calls.push(req);

    // first try match-based entries
    const matchIdx = this.queue.findIndex((q) => q.match && q.match(req));
    if (matchIdx >= 0) {
      const [item] = this.queue.splice(matchIdx, 1);
      return Promise.resolve(materialise<T>(item!.response));
    }

    // then take next queued (no matcher)
    const nextIdx = this.queue.findIndex((q) => !q.match);
    if (nextIdx >= 0) {
      const [item] = this.queue.splice(nextIdx, 1);
      return Promise.resolve(materialise<T>(item!.response));
    }

    return Promise.resolve(materialise<T>(this.fallback));
  }
}

function materialise<T>(partial: Partial<HttpResponse<unknown>>): HttpResponse<T> {
  return {
    ok: partial.ok ?? false,
    status: partial.status ?? 500,
    headers: partial.headers ?? {},
    data: (partial.data ?? null) as T | null,
  };
}
