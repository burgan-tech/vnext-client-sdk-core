// ─────────────────────────────────────────────────────────────────────────
// Device identity — resolved once at app startup, BEFORE any token.
//
// Platform-agnostic on purpose (no web/mobile APIs here) so the same logic can
// be exported to Dart/Swift/React via parity checks. The host supplies an
// `IdentityStore` (persistent + session), an id generator, deviceInfo and
// appVersion; this module only decides the persistence policy:
//
//   • deviceId       — STABLE per device/browser  → persistent store
//   • installationId — NEW per app open (web) / per install (mobile) → session store
//
// Web policy (decided here): deviceId persists in localStorage (a "browser =
// device" identity); installationId lives in sessionStorage so every fresh
// browser/tab open gets a new one. Mobile adapters map persistent→secure device
// storage and session→install-scoped storage.
// ─────────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  osName: string;
  osVersion: string;
  deviceModel: string;
  manufacturer: string;
  screenResolution?: string;
  language?: string;
  timezone?: string;
  [k: string]: unknown;
}

export interface DeviceIdentity {
  deviceId: string;
  installationId: string;
  deviceInfo: DeviceInfo;
  appVersion: string;
}

/** Storage abstraction the host implements (web: local/session; mobile: secure/install). */
export interface IdentityStore {
  getPersistent(key: string): string | null;
  setPersistent(key: string, value: string): void;
  getSession(key: string): string | null;
  setSession(key: string, value: string): void;
}

export const DEVICE_ID_KEY = 'vnext.device.id';
export const INSTALLATION_ID_KEY = 'vnext.installation.id';

export interface ResolveIdentityOptions {
  store: IdentityStore;
  /** e.g. () => crypto.randomUUID() on web. */
  newId: () => string;
  deviceInfo: DeviceInfo;
  appVersion: string;
}

export function resolveDeviceIdentity(opts: ResolveIdentityOptions): DeviceIdentity {
  const { store, newId, deviceInfo, appVersion } = opts;

  let deviceId = store.getPersistent(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = newId();
    store.setPersistent(DEVICE_ID_KEY, deviceId);
  }

  let installationId = store.getSession(INSTALLATION_ID_KEY);
  if (!installationId) {
    installationId = newId();
    store.setSession(INSTALLATION_ID_KEY, installationId);
  }

  return { deviceId, installationId, deviceInfo, appVersion };
}
