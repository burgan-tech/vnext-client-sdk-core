/**
 * Synthetic timer for deterministic long-polling tests.
 *
 * `tick(ms)` advances the clock and runs every callback whose deadline lies
 * inside the slice. Callbacks may schedule new callbacks; tick continues
 * until the queue (within the slice) is empty.
 *
 * `flush(maxIterations)` keeps ticking until the queue is empty (subject to a
 * safety bound).
 */

import type { Timer, TimerHandle } from '../../src/types.js';

interface Entry {
  id: number;
  fn: () => void;
  due: number;
}

export class FakeTimer implements Timer {
  private current = 0;
  private nextId = 1;
  private readonly entries = new Map<number, Entry>();

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    this.entries.set(id, { id, fn, due: this.current + ms });
    return id;
  }

  clearTimeout(handle: TimerHandle): void {
    if (typeof handle === 'number') this.entries.delete(handle);
  }

  now(): number {
    return this.current;
  }

  /** Advance virtual time. Runs every due callback synchronously. */
  async tick(ms: number): Promise<void> {
    const target = this.current + ms;
    while (true) {
      const due = [...this.entries.values()].filter((e) => e.due <= target).sort((a, b) => a.due - b.due);
      if (due.length === 0) break;
      const next = due[0]!;
      this.current = next.due;
      this.entries.delete(next.id);
      next.fn();
      // Yield to the microtask queue so awaited promises inside `fn` can settle.
      await Promise.resolve();
    }
    this.current = target;
  }

  pendingCount(): number {
    return this.entries.size;
  }
}
