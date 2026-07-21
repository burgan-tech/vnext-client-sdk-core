// ─────────────────────────────────────────────────────────────────────────
// app-host wiring for this Vue app (web adapter).
//
// The app boots from ONE constant — clientId. At startup it:
//   1. resolves a device identity (deviceId persists per browser; installationId
//      is fresh each browser/tab open) + web deviceInfo,
//   2. acquires a REAL pre-login device token from the bank IDM via the
//      client_credentials grant, binding deviceId/installationId as customClaims,
//   3. discovers environment/client-config/navigation from the local shell backend.
//
// Device-token acquisition is tolerant: on failure boot continues at device level.
// ─────────────────────────────────────────────────────────────────────────
import {
  createAppHost,
  resolveDeviceIdentity,
  runContextProviders,
  type AppHost,
  type DeviceIdentity,
  type DeviceRegistration,
  type EnvironmentResponse,
  type FetchJson,
  type IdentityStore,
  type TokenLevel,
} from '@burgan-tech/app-host';
import { Boundary, Storage, getContextValue, setContextValue } from '../sdk/context';
import { getOrCreateDeviceKeyPair } from './deviceCrypto';
import { CLIENT_ID, APP_VERSION, SHELL_BASE, CTX } from './constants';
import { standardHeaders } from './apiHeaders';
import { initMorphClient, setMorphTokens, getMorphClient, getTokenLevelOrder } from './morphClient';
import { webDeviceInfo } from './platform';
import { webContextProviders } from './contextProviders';

export { CLIENT_ID };

const DEVICE_REGISTRATION_KEY = 'device.registration';
/** Ambient values live in context-store (device boundary, session-scoped memory). */
const AMBIENT = { boundary: Boundary.device, storage: Storage.memory } as const;

/** Boot must never hang on device provisioning / IDM: cap each with a timeout. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
const STARTUP_TIMEOUT_MS = 10000;
// Shell config reads run `sync=true` (synchronous instance materialization) and
// can legitimately take 10–18s on the slow bank test backend; cap each so a true
// hang surfaces as a boot error (retryable) instead of an endless blank screen.
const SHELL_FETCH_TIMEOUT_MS = 30000;

const fetchJson: FetchJson = async (path, init) => {
  const url = new URL(SHELL_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SHELL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      signal: ctrl.signal,
      headers: { ...standardHeaders(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) throw new Error(`[shell] HTTP ${res.status} for ${path}`);
    return res.json();
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`[shell] timeout after ${SHELL_FETCH_TIMEOUT_MS}ms for ${path}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetch a shell-domain View by key and return its pseudo-ui content.
 * A published sys-views View is queryable as an instance of the `sys-views`
 * workflow (view key = instance key): GET /workflows/sys-views/instances/{key}.
 *
 * Views are immutable per key (a published definition), so results are cached
 * per session (by the in-flight promise) — this collapses the duplicate fetches
 * that repeated tab activations would otherwise fire at the slow backend.
 */
const shellViewCache = new Map<string, Promise<Record<string, unknown> | null>>();
export function loadShellView(key: string): Promise<Record<string, unknown> | null> {
  let p = shellViewCache.get(key);
  if (!p) {
    p = (async () => {
      const raw = (await fetchJson(`/workflows/sys-views/instances/${key}`, { query: { sync: 'true' } })) as {
        attributes?: { content?: unknown; display?: unknown };
      };
      const content = raw?.attributes?.content as Record<string, unknown> | null | undefined;
      if (!content) return null;
      // Surface the view-level `display` hint (e.g. "full-page") alongside the
      // content so the host surface can size itself (list pages go full-width).
      return { ...content, display: raw?.attributes?.display };
    })().catch((e) => {
      console.warn(`[shell] loadShellView(${key}) failed`, e);
      shellViewCache.delete(key); // allow a retry on next call
      return null;
    });
    shellViewCache.set(key, p);
  }
  return p;
}

/** Fetch a theme by key from the shell `theme` workflow (instance = theme). */
export async function loadTheme(key: string): Promise<{ mode?: string; tokens?: Record<string, string> } | null> {
  try {
    const raw = (await fetchJson(`/workflows/theme/instances/${key}`, { query: { sync: 'true' } })) as {
      attributes?: { mode?: string; tokens?: Record<string, string> };
    };
    const a = raw?.attributes;
    return a ? { ...(a.mode ? { mode: a.mode } : {}), tokens: a.tokens ?? {} } : null;
  } catch (e) {
    console.warn(`[shell] loadTheme(${key}) failed`, e);
    return null;
  }
}

// ── Device identity (web) ────────────────────────────────────────────────
const identityStore: IdentityStore = {
  getPersistent: (k) => window.localStorage.getItem(k),
  setPersistent: (k, v) => window.localStorage.setItem(k, v),
  getSession: (k) => window.sessionStorage.getItem(k),
  setSession: (k, v) => window.sessionStorage.setItem(k, v),
};

// Compute the device identity (pure): deviceId/installationId + web device info.
// Seeding these into the context-store is NOT done here — a context provider owns
// that (boot/contextProviders.ts), run eagerly before the first request.
function resolveIdentity(): DeviceIdentity {
  return resolveDeviceIdentity({
    store: identityStore,
    newId: () => crypto.randomUUID(),
    deviceInfo: webDeviceInfo(),
    appVersion: APP_VERSION,
  });
}

// ── Device registration (real bank IDM device-manager, tolerant) ───────────
// Called every launch (device-manager is the per-launch device entry). Ensures a
// persistent device keypair, presents its public key as the device certificate,
// and stores the registration result. The IDM keys the device fact by the cert,
// so a stable key makes this idempotent.
async function provisionDevice(ctx: {
  deviceIdentity: DeviceIdentity;
  idmBase?: string;
  provisioningEndpoint?: string;
}): Promise<DeviceRegistration> {
  const { deviceInfo, appVersion } = ctx.deviceIdentity;
  const { publicKeyPem } = await getOrCreateDeviceKeyPair();

  const idmBase = ctx.idmBase; // from environment `hosts` (config)
  const endpoint = ctx.provisioningEndpoint; // from device-context config
  if (!idmBase || !endpoint) throw new Error('[app-host] device provisioning not configured (hosts.idm / device.provisioning)');
  const url = new URL(idmBase + endpoint, window.location.origin);
  url.searchParams.set('sync', 'true');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...standardHeaders() },
    body: JSON.stringify({ attributes: { deviceInfo, deviceCertificatePublicKey: publicKeyPem, appVersion } }),
  });
  if (!res.ok) throw new Error(`device-manager HTTP ${res.status}`);

  const body = (await res.json()) as {
    id?: string;
    status?: string;
    attributes?: { deviceData?: { instanceId?: string } };
  };
  const reg: DeviceRegistration = {
    publicKeyPem,
    registeredAt: new Date().toISOString(),
    ...(body.id ? { deviceManagerInstanceId: body.id } : {}),
    ...(body.attributes?.deviceData?.instanceId ? { deviceInstanceId: body.attributes.deviceData.instanceId } : {}),
    ...(body.status ? { status: body.status } : {}),
  };
  setContextValue(DEVICE_REGISTRATION_KEY, reg, { boundary: Boundary.device, storage: Storage.localStorage });
  return reg;
}

// ── Auth client init + device token (generic, config-driven, tolerant) ─────
// Runs after the environment is fetched, before token-level resolution. Inits
// the generic MorphClient from config, then acquires the pre-login device token
// by running the machine (client_credentials) context's vNext workflow and
// handing the result to the client via setTokens. No provider/level literals.
type CtxCfg = {
  key: string;
  clientId?: string;
  clientSecret?: string;
  token?: { endpoint?: string; grantType?: string };
  delegateMetadata?: { grantHint?: string };
};

async function afterEnvironment(ctx: {
  environment: EnvironmentResponse;
  idmBase?: string;
}): Promise<void> {
  initMorphClient(ctx.environment, ctx.idmBase);

  const idmBase = ctx.idmBase;
  const providers = (ctx.environment.morphConfig?.providers ?? []) as Array<{ key: string; contexts?: CtxCfg[] }>;
  for (const p of providers) {
    for (const c of p.contexts ?? []) {
      // The device/machine context: non-interactive client_credentials.
      const isMachine = c.delegateMetadata?.grantHint === 'client_credentials' || c.token?.grantType === 'client_credentials';
      if (!isMachine || !idmBase || !c.token?.endpoint) continue;
      try {
        const url = new URL(idmBase + c.token.endpoint, window.location.origin);
        url.searchParams.set('sync', 'true');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...standardHeaders() },
          body: JSON.stringify({
            attributes: {
              clientId: c.clientId ?? CLIENT_ID,
              clientSecret: c.clientSecret,
              grantType: c.token.grantType ?? 'client_credentials',
              customClaims: {
                deviceId: getContextValue(CTX.deviceId, AMBIENT) ?? '',
                installationId: getContextValue(CTX.installationId, AMBIENT) ?? '',
              },
            },
          }),
        });
        if (!res.ok) throw new Error(`device token HTTP ${res.status}`);
        const body = (await res.json()) as { access_token?: string; attributes?: { tokenCreation?: { access_token?: string } } };
        const token = body.access_token ?? body.attributes?.tokenCreation?.access_token;
        if (token) await setMorphTokens(`${p.key}/${c.key}`, { accessToken: token });
      } catch (e) {
        console.warn('[app-host] device token acquisition failed — continuing', e);
      }
    }
  }
}

/** Derive the token level from the auth client's status (which context has a
 * token), walking the config-declared privilege order (morphConfig.tokenLevels,
 * highest first). Both the context keys and their order come from config; the
 * TokenLevel union is just a convenience cast at this boundary. */
async function resolveTokenLevel(): Promise<TokenLevel> {
  const status = (await getMorphClient()?.getTokenStatus()) ?? [];
  const has = (ctxKey: string) => status.some((s) => s.contextKey === ctxKey && s.hasAccessToken);
  const order = getTokenLevelOrder();
  for (const level of order) {
    if (has(level)) return level;
  }
  // No token for any declared level → the lowest-privilege one (last in order).
  return order[order.length - 1] ?? 'device';
}

export async function bootAppHost(): Promise<AppHost> {
  // Seed the ambient bus BEFORE any request so even the first call (environment)
  // carries device headers, and so the `initialization` sequence can read these
  // values via `x-context-source`. Context providers are the writers; they run
  // eagerly here. resolveIdentity is a pure compute (idempotent), so discovery
  // calling it again is harmless.
  const deviceIdentity = resolveIdentity();
  await runContextProviders(
    webContextProviders,
    {
      clientId: CLIENT_ID,
      appVersion: APP_VERSION,
      deviceIdentity,
      log: (level, message, extra) => console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](`[app-host] ${message}`, extra ?? ''),
    },
    // Provider slots use portable string boundary/storage; map to the store enums
    // (string-enum values equal the strings, so index by key).
    (w) => setContextValue(w.key, w.value, { boundary: Boundary[w.boundary], storage: Storage[w.storage ?? 'memory'] }),
  );
  return createAppHost(
    { clientId: CLIENT_ID, shellBase: SHELL_BASE },
    {
      fetchJson,
      resolveIdentity,
      resolveTokenLevel,
      provisionDevice: (ctx) => withTimeout(provisionDevice(ctx), STARTUP_TIMEOUT_MS, 'device registration'),
      afterEnvironment: (ctx) => withTimeout(afterEnvironment(ctx), STARTUP_TIMEOUT_MS, 'auth client / device token'),
      log: (level, message, extra) => {
        const style = level === 'error' || level === 'warn' ? 'color:#c0392b;font-weight:bold' : 'color:#4f46e5';
        // eslint-disable-next-line no-console
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
          `%c[app-host] ${message}`, style, extra ?? '',
        );
      },
    },
  );
}
