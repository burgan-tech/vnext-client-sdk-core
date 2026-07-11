// ─────────────────────────────────────────────────────────────────────────
// workflow-manager wired to the REAL bank IDM (morph-idm), transport-only.
//
// A tiny fetch-based HttpDelegate (no morph) posts to the IDM via the Vite
// `/api/v1` proxy and attaches the device-context headers the login flow needs
// (X-Device-Id / X-Installation-Id / user_reference). Used to drive the
// interactive 2FA `user-login` workflow through pseudo-ui.
// ─────────────────────────────────────────────────────────────────────────
import { WorkflowManager } from 'amorphie-workflow-manager';
import type { HttpDelegate, HttpRequest, HttpResponse } from 'amorphie-workflow-manager';
import { DEVICE_ID_KEY, INSTALLATION_ID_KEY } from '@burgan-tech/app-host';

const IDM_API_BASE = '/api/v1'; // proxied to test-vnext-morph-idm

function deviceHeaders(): Record<string, string> {
  const deviceId = window.localStorage.getItem(DEVICE_ID_KEY) ?? 'unknown-device';
  const installationId = window.sessionStorage.getItem(INSTALLATION_ID_KEY) ?? 'unknown-install';
  return {
    'Accept-Language': 'tr-TR',
    'X-Request-Id': crypto.randomUUID(),
    'X-Token-Id': crypto.randomUUID(),
    'X-Device-Id': deviceId,
    'X-Installation-Id': installationId,
    'X-Device-Info': 'vnext-web/0.1',
    user_reference: 'anonymous',
  };
}

function buildUrl(path: string, query?: HttpRequest['query']): string {
  const url = new URL(IDM_API_BASE + path, window.location.origin);
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
        ...deviceHeaders(),
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
    headers: { ...deviceHeaders(), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
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
  workflows: [{ domain: 'morph-idm', name: 'user-login', version: '1.0.0' }],
  defaultLongPollingConfig: { intervalSeconds: 2, durationSeconds: 30, timeoutSeconds: 10, useETag: true },
  onLog: (level, message) => console.debug(`%c[idm-wf] ${level}: ${message}`, 'color:#0a0'),
});
