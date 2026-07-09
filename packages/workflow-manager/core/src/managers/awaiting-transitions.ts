/**
 * Tracks confirmation-pending transition requests so the host can confirm or
 * cancel them later via `startAwaitingTransition` / `cancelAwaitingTransition`.
 *
 * Key shape: `${instanceId}:${transitionKey}`. Multiple distinct transition
 * keys per instance are allowed; submitting a fresh request with the same key
 * overrides the previous entry (the consumer changed their mind).
 */

import type { StartTransitionInput } from '../types.js';

export interface AwaitingEntry {
  instanceId: string;
  transitionKey: string;
  request: StartTransitionInput;
  createdAt: number;
}

export class AwaitingTransitionsManager {
  private readonly map = new Map<string, AwaitingEntry>();

  static keyOf(instanceId: string, transitionKey: string): string {
    return `${instanceId}:${transitionKey}`;
  }

  set(entry: AwaitingEntry): void {
    this.map.set(AwaitingTransitionsManager.keyOf(entry.instanceId, entry.transitionKey), entry);
  }

  get(instanceId: string, transitionKey: string): AwaitingEntry | null {
    return this.map.get(AwaitingTransitionsManager.keyOf(instanceId, transitionKey)) ?? null;
  }

  /** Pop a single entry (consume it). */
  take(instanceId: string, transitionKey: string): AwaitingEntry | null {
    const key = AwaitingTransitionsManager.keyOf(instanceId, transitionKey);
    const entry = this.map.get(key);
    if (!entry) return null;
    this.map.delete(key);
    return entry;
  }

  /** Cancel a single entry. */
  cancel(instanceId: string, transitionKey: string): boolean {
    return this.map.delete(AwaitingTransitionsManager.keyOf(instanceId, transitionKey));
  }

  /** Cancel every pending entry for an instance. */
  cancelAllFor(instanceId: string): number {
    let count = 0;
    for (const key of this.map.keys()) {
      if (key.startsWith(`${instanceId}:`)) {
        this.map.delete(key);
        count += 1;
      }
    }
    return count;
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
