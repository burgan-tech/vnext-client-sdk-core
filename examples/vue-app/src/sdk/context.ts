// ─────────────────────────────────────────────────────────────────────────
// context-store (data-manager SDK) — the shared reactive state bus.
//
// A single ContextStore instance is created here and shared across all 5 SDKs
// (provided app-wide in main.ts). The store is NOT Vue-reactive by itself; use
// the `useContextValue` composable below to bridge an observed key into a ref.
// ─────────────────────────────────────────────────────────────────────────
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import {
  ContextStore,
  Boundary,
  Storage,
  type Subscription,
} from '@burgantech/context-store';

export { Boundary, Storage };

export const contextStore = ContextStore.create({
  appName: 'vnext-vue-app',
  appVersion: '0.1.0',
  // getServerTime() is never called in this sample, but create() requires these.
  timeServerUrls: [],
  onRequestServerTime: async () => null,
  onLog: (level, message) => {
    // eslint-disable-next-line no-console
    console.debug(`%c[context-store] ${level}: ${message}`, 'color:#0aa');
  },
});

export const CONTEXT_STORE_KEY = 'vnext.contextStore';

/**
 * Bridge a context-store key into a Vue ref. Subscribes on mount, seeds the
 * current value, and unsubscribes on unmount (the store does not replay values,
 * so we seed manually after subscribing).
 */
export function useContextValue<T>(
  key: string,
  opts: { boundary?: Boundary; storage?: Storage } = {},
): Ref<T | undefined> {
  const boundary = opts.boundary ?? Boundary.device;
  const storage = opts.storage ?? Storage.localStorage;
  const value = ref<T>() as Ref<T | undefined>;
  let sub: Subscription | undefined;

  onMounted(() => {
    sub = contextStore
      .observeData(boundary, key, { storage })
      .subscribe((v: unknown) => {
        value.value = v as T;
      });
    value.value = contextStore.getData<T>(boundary, key, { storage });
  });

  onUnmounted(() => sub?.unsubscribe());

  return value;
}

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
