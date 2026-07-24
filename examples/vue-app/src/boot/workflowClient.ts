// ─────────────────────────────────────────────────────────────────────────
// The app's workflow-manager client — transport-only, domain-agnostic.
//
// A tiny fetch-based HttpDelegate posts to the backend host (base from the
// environment `hosts` config, mirrored to context-store) and attaches the
// standard headers (docs/http-headers-standard.md) plus X-Workflow. Used for
// every workflow domain (login, device lists, instance queries, states, …).
// ─────────────────────────────────────────────────────────────────────────
import { WorkflowManager } from 'amorphie-workflow-manager';
import type { HttpDelegate, HttpRequest, HttpResponse } from 'amorphie-workflow-manager';
import { Boundary, Storage, getContextValue } from '../sdk/context';
import { CTX } from './constants';
import { standardHeaders, workflowHeader } from './apiHeaders';
import { contextSourceBodyFilter } from './contextSourceFilter';

/** IDM host base from the shared bus (seeded from environment `hosts` at boot). */
function idmBase(): string {
  const base = getContextValue<string>(CTX.idmBase, { boundary: Boundary.device, storage: Storage.memory });
  if (!base) throw new Error('[wf] IDM host not seeded — boot must resolve environment.hosts.idm first');
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
  // Two backends: the `shell` domain lives on the local shell orchestrator
  // (Vite `/shell` proxy → :4221), everything else on the IDM host (`idmBase`).
  // A `/shell/...` path routes same-origin so the `/shell` proxy handles it;
  // prepending `idmBase` (the IDM `/api/v1`) would (wrongly) send it to IDM.
  const base = path.startsWith('/shell/') ? '' : idmBase();
  const url = new URL(base + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  return url.toString();
}

/** The one IDM request path: URL + standard/workflow headers + fetch + tolerant
 * JSON decode. Both the workflow-manager delegate and the direct `apiFetch` wrap it. */
async function apiRequest<T = unknown>(input: {
  path: string;
  method?: string;
  body?: unknown;
  query?: HttpRequest['query'];
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; headers: Record<string, string>; data: T | null }> {
  const res = await fetch(buildUrl(input.path, input.query), {
    method: input.method ?? 'GET',
    headers: {
      ...standardHeaders(),
      ...workflowHeaderFor(input.path),
      ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(input.headers ?? {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
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
}

/** Minimal fetch HttpDelegate — the SDK passes host-relative `/{domain}/...` paths. */
export const httpDelegate: HttpDelegate = {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    return apiRequest<T>(req);
  },
};

/** Direct IDM call (device headers + /api/v1 proxy) for flows outside workflow-manager (e.g. token redeem). */
export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const { ok, status, data } = await apiRequest<T>({ path, ...opts });
  return { ok, status, data };
}

export const workflowManager = WorkflowManager.create({
  http: httpDelegate,
  // Schema-driven payload wiring: on every start/transition, inject the values the
  // client already holds (x-context-source) resolved from the transition schema.
  transitionBodyFilter: contextSourceBodyFilter,
  // Managed-workflow list is not enforced by the SDK; the actual domain/name for
  // each operation come per-call from the backend nav config (no client hardcode).
  workflows: [],
  defaultLongPollingConfig: { intervalSeconds: 2, durationSeconds: 30, timeoutSeconds: 10, useETag: true },
  onLog: (level, message) => console.debug(`%c[wf] ${level}: ${message}`, 'color:#0a0'),
});
