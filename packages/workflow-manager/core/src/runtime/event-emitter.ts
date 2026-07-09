/**
 * Minimal type-safe event emitter — zero dependencies. Returns an unsubscribe
 * handle on every subscription so the SDK never leaks listeners on dispose.
 */

import type { Subscription } from '../types.js';

export class EventEmitter<TMap extends object> {
  private readonly listeners = new Map<keyof TMap, Set<(payload: unknown) => void>>();

  on<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): Subscription {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const wrapped = handler as (payload: unknown) => void;
    bucket.add(wrapped);
    return {
      unsubscribe: () => {
        const set = this.listeners.get(event);
        set?.delete(wrapped);
      },
    };
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const handler of bucket) {
      try {
        handler(payload);
      } catch {
        // Swallow listener errors so a faulty handler can't break others.
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  listenerCount<K extends keyof TMap>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
