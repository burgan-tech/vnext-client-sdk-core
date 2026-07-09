/**
 * In-memory `VNextState` cache keyed by `workflowName`. Tracks ETags so the
 * long-polling manager can supply `If-None-Match` on each tick.
 */

import type { VNextState } from '../types.js';

export class StateManager {
  private readonly cache = new Map<string, VNextState>();

  set(state: VNextState): void {
    this.cache.set(state.workflowName, state);
  }

  get(workflowName: string): VNextState | null {
    return this.cache.get(workflowName) ?? null;
  }

  getInstanceId(workflowName: string): string | undefined {
    return this.cache.get(workflowName)?.instanceId;
  }

  getETag(workflowName: string): string | undefined {
    return this.cache.get(workflowName)?.eTag;
  }

  delete(workflowName: string): void {
    this.cache.delete(workflowName);
  }

  clear(): void {
    this.cache.clear();
  }

  has(workflowName: string): boolean {
    return this.cache.has(workflowName);
  }

  list(): VNextState[] {
    return Array.from(this.cache.values());
  }
}
