// ─────────────────────────────────────────────────────────────────────────
// context-store (data-manager SDK) — the shared reactive state bus.
//
// A single ContextStore instance, shared across all 5 SDKs. Ambient values
// (clientId/deviceId/locale/…) are written here at boot and read back via the
// plain get/set helpers below.
// ─────────────────────────────────────────────────────────────────────────
import { ContextStore, Boundary, Storage } from '@burgantech/context-store';
import { APP_VERSION } from '../boot/constants';

export { Boundary, Storage };

export const contextStore = ContextStore.create({
  appName: 'vnext-vue-app',
  appVersion: APP_VERSION,
  // getServerTime() is never called in this sample, but create() requires these.
  timeServerUrls: [],
  onRequestServerTime: async () => null,
  onLog: (level, message) => {
    const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug;
    log(`[context-store] ${level}: ${message}`);
  },
});

export function setContextValue(
  key: string,
  value: unknown,
  opts: { boundary?: Boundary; storage?: Storage } = {},
): void {
  contextStore.setData(
    opts.boundary ?? Boundary.device,
    key,
    value,
    { storage: opts.storage ?? Storage.localStorage },
  );
}

/** Plain (non-reactive) read of a context-store value. */
export function getContextValue<T>(
  key: string,
  opts: { boundary?: Boundary; storage?: Storage } = {},
): T | undefined {
  return contextStore.getData<T>(
    opts.boundary ?? Boundary.device,
    key,
    { storage: opts.storage ?? Storage.localStorage },
  );
}
