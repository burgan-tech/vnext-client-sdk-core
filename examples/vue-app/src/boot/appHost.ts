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
  type AppHost,
  type DeviceIdentity,
  type DeviceInfo,
  type DeviceRegistration,
  type EnvironmentStage,
  type FetchJson,
  type IdentityStore,
  type TokenLevel,
} from '@burgan-tech/app-host';
import { Boundary, Storage, getContextValue, setContextValue } from '../sdk/context';
import { getOrCreateDeviceKeyPair } from './deviceCrypto';
import { CLIENT_ID, APP_VERSION, SHELL_BASE, CTX } from './constants';
import { standardHeaders } from './apiHeaders';

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
        attributes?: { content?: unknown };
      };
      return (raw?.attributes?.content ?? null) as Record<string, unknown> | null;
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

function webDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const os =
    /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' :
    /(iPhone|iPad|iPod)/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Web';
  return {
    osName: os,
    osVersion: (navigator as { appVersion?: string }).appVersion ?? 'unknown',
    deviceModel: 'browser',
    manufacturer: navigator.vendor || 'unknown',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: ua,
  };
}

function resolveIdentity(): DeviceIdentity {
  const identity = resolveDeviceIdentity({
    store: identityStore,
    newId: () => crypto.randomUUID(),
    deviceInfo: webDeviceInfo(),
    appVersion: APP_VERSION,
  });
  // Seed the shared bus: everyone reads ambient values from context-store, so the
  // SDK writes them here once at init (this is also what `x-context-source` targets).
  setContextValue(CTX.clientId, CLIENT_ID, AMBIENT);
  setContextValue(CTX.appVersion, APP_VERSION, AMBIENT);
  setContextValue(CTX.deviceId, identity.deviceId, AMBIENT);
  setContextValue(CTX.installationId, identity.installationId, AMBIENT);
  return identity;
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

// ── Device token (real bank IDM, tolerant) ─────────────────────────────────
async function acquireDeviceToken(ctx: {
  stage: EnvironmentStage;
  deviceIdentity?: DeviceIdentity;
  idmBase?: string;
  tokenEndpoint?: string;
}): Promise<string | void> {
  const provider = ctx.stage.authProviders?.find((p) => p.key === 'morph-idm-device');
  const gf = provider?.grantFlow;
  if (!gf) throw new Error('no morph-idm-device grantFlow in environment');

  const idmBase = ctx.idmBase; // single source: environment `hosts` (config)
  const endpoint = ctx.tokenEndpoint; // from device-context config
  if (!idmBase || !endpoint) throw new Error('[app-host] device token not configured (hosts.idm / device.token)');
  const url = new URL(idmBase + endpoint, window.location.origin);
  url.searchParams.set('sync', 'true');

  // Ambient claims are read from the shared bus (context-store), not passed in.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...standardHeaders() },
    body: JSON.stringify({
      attributes: {
        clientId: gf['clientId'] ?? getContextValue(CTX.clientId, AMBIENT) ?? CLIENT_ID,
        clientSecret: gf['clientSecret'],
        grantType: gf['grantType'] ?? 'client_credentials',
        // clientId already encodes the channel (IbWeb); the IDM doesn't read a
        // separate `channel` claim, so it isn't sent.
        customClaims: {
          deviceId: getContextValue(CTX.deviceId, AMBIENT) ?? '',
          installationId: getContextValue(CTX.installationId, AMBIENT) ?? '',
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`IDM token HTTP ${res.status}`);

  const body = (await res.json()) as { access_token?: string; attributes?: { tokenCreation?: { access_token?: string } } };
  const token = body.access_token ?? body.attributes?.tokenCreation?.access_token;
  if (!token) throw new Error('IDM token response had no access_token');

  // Persist under the key the environment declared, device boundary.
  const key = String(provider?.tokenTypes && (provider.tokenTypes as { access?: { storage?: { key?: string } } }).access?.storage?.key)
    || 'auth.token.morph-idm-device.access';
  setContextValue(key, token, { boundary: Boundary.device, storage: Storage.memory });

  return token;
}

/** Derive the token level from which access token is present in context-store. */
function resolveTokenLevel(): TokenLevel {
  const held = (key: string, b: Boundary) =>
    !!getContextValue(key, { boundary: b, storage: Storage.memory });
  if (held('auth.token.morph-idm-2fa.access', Boundary.user)) return '2fa';
  if (held('auth.token.morph-idm-1fa.access', Boundary.user)) return '1fa';
  return 'device';
}

export function bootAppHost(): Promise<AppHost> {
  // Seed the ambient bus BEFORE any request so even the first call (environment)
  // carries device headers. resolveIdentity is idempotent, so discovery calling
  // it again is harmless.
  resolveIdentity();
  return createAppHost(
    { clientId: CLIENT_ID, shellBase: SHELL_BASE },
    {
      fetchJson,
      resolveIdentity,
      resolveTokenLevel,
      provisionDevice: (ctx) => withTimeout(provisionDevice(ctx), STARTUP_TIMEOUT_MS, 'device registration'),
      acquireDeviceToken: (ctx) => withTimeout(acquireDeviceToken(ctx), STARTUP_TIMEOUT_MS, 'device token'),
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
