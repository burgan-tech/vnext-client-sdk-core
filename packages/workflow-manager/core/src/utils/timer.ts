/**
 * Default `Timer` implementation backed by `setTimeout` / `clearTimeout` /
 * `Date.now`. Tests can substitute their own `Timer` to drive long-polling
 * deterministically.
 */

import type { Timer, TimerHandle } from '../types.js';

export class DefaultTimer implements Timer {
  setTimeout(fn: () => void, ms: number): TimerHandle {
    return setTimeout(fn, ms) as unknown as TimerHandle;
  }

  clearTimeout(handle: TimerHandle): void {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  }

  now(): number {
    return Date.now();
  }
}

/** Singleton convenience for places that don't take an explicit Timer. */
export const defaultTimer: Timer = new DefaultTimer();
