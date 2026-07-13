// ─────────────────────────────────────────────────────────────────────────
// workflow-manager wired to the REAL bank IDM (morph-idm), transport-only.
//
// A tiny fetch-based HttpDelegate posts to the IDM host (base from the
// environment `hosts` config, mirrored to context-store) and attaches the
// standard headers (docs/http-headers-standard.md) plus X-Workflow. Used to
// drive the interactive 2FA `user-login` workflow through pseudo-ui.
// ─────────────────────────────────────────────────────────────────────────
import { WorkflowManager } from 'amorphie-workflow-manager';
import type { HttpDelegate, HttpRequest, HttpResponse } from 'amorphie-workflow-manager';
import { Boundary, Storage, getContextValue } from '../sdk/context';
import { CTX } from './constants';
import { standardHeaders, workflowHeader } from './apiHeaders';

/** IDM host base from the shared bus (seeded from environment `hosts` at boot). */
function idmBase(): string {
  const base = getContextValue<string>(CTX.idmBase, { boundary: Boundary.device, storage: Storage.memory });
  if (!base) throw new Error('[idm-wf] IDM host not seeded — boot must resolve environment.hosts.idm first');
  return base;
}

/** Best-effort X-Workflow from a `/{domain}/workflows/{wf}/instances/{id}/…` path. */
function workflowHeaderFor(path: string): Record<string, string> {
  const m = /^\/([^/]+)\/workflows\/([^/]+)\/instances\/([^/?]+)/.exec(path);
  if (!m) return {};
  const [, domain, workflow, instance] = m;
  return workflowHeader(domain!, workflow!, '1.0.0', instance === 'start' ? undefined : instance);
}

function buildUrl(path: string, query?: HttpRequest['query']): string {
  const url = new URL(idmBase() + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Minimal fetch HttpDelegate — the SDK passes host-relative `/{domain}/...` paths. */
export const idmHttpDelegate: HttpDelegate = {
  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const res = await fetch(buildUrl(req.path, req.query), {
      method: req.method,
      headers: {
        ...standardHeaders(),
        ...workflowHeaderFor(req.path),
        ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(req.headers ?? {}),
      },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => (headers[key] = value));
    return {
      ok: (res.status >= 200 && res.status < 300) || res.status === 304,
      status: res.status,
      headers,
      data: data as T | null,
    };
  },
};

/** Direct IDM call (device headers + /api/v1 proxy) for flows outside workflow-manager (e.g. token redeem). */
export async function idmFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers: {
      ...standardHeaders(),
      ...workflowHeaderFor(path),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data: data as T | null };
}

export const idmWorkflowManager = WorkflowManager.create({
  http: idmHttpDelegate,
  // Managed-workflow list is not enforced by the SDK; the actual domain/name for
  // each operation come per-call from the backend nav config (no client hardcode).
  workflows: [],
  defaultLongPollingConfig: { intervalSeconds: 2, durationSeconds: 30, timeoutSeconds: 10, useETag: true },
  onLog: (level, message) => console.debug(`%c[idm-wf] ${level}: ${message}`, 'color:#0a0'),
});
