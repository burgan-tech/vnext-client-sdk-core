import type { Subscription } from '../types.js';

/**
 * Tek event türü için listener registry. SDK'nın tüm `onXxx` event'leri bu
 * primitive üzerine kuruludur.
 *
 * Garanti edilen davranışlar (test'lerde sabitlenmiştir):
 *
 * - `unsubscribe` idempotent.
 * - `emit` sırasında bir handler `subscribe` çağırırsa, yeni handler **bu
 *   emit'te değil**, sonraki emit'te çağrılır (snapshot iteration).
 * - `emit` sırasında henüz çağrılmamış bir handler `unsubscribe` edilirse o
 *   handler **bu emit'te de çağrılmaz**.
 * - Handler exception fırlatırsa diğerleri etkilenmez; opsiyonel
 *   `onHandlerError` callback'i çağrılır.
 */
export interface Signal<T> {
  subscribe(handler: (payload: T) => void): Subscription;
  emit(payload: T): void;
  clear(): void;
  readonly size: number;
}

export interface SignalOptions {
  onHandlerError?: (err: unknown) => void;
}

export function createSignal<T>(opts: SignalOptions = {}): Signal<T> {
  const handlers = new Set<(payload: T) => void>();
  const { onHandlerError } = opts;

  return {
    get size() {
      return handlers.size;
    },
    subscribe(handler) {
      handlers.add(handler);
      return {
        unsubscribe() {
          handlers.delete(handler);
        },
      };
    },
    emit(payload) {
      // Snapshot so that subscribe() during dispatch defers to the next emit
      // and unsubscribe() during dispatch can cancel a pending callback.
      const snapshot = Array.from(handlers);
      for (const handler of snapshot) {
        if (!handlers.has(handler)) continue;
        try {
          handler(payload);
        } catch (err) {
          if (onHandlerError) {
            try {
              onHandlerError(err);
            } catch {
              // never let an error reporter throw out of a dispatch loop
            }
          }
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
