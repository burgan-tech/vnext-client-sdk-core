/**
 * Data cache + loader orchestration. Fetches the `data` instance function via
 * the configured `DataLoader` and stores both the payload and its ETag so the
 * next call can supply `If-None-Match`.
 */

import type { DataLoader, OnLog, VNextData } from '../types.js';

export class DataManager {
  private readonly cache = new Map<string, VNextData>();
  private readonly loader: DataLoader;
  private readonly onLog?: OnLog;

  constructor(opts: { loader: DataLoader; onLog?: OnLog }) {
    this.loader = opts.loader;
    if (opts.onLog) this.onLog = opts.onLog;
  }

  get(instanceId: string): Record<string, unknown> | null {
    const cached = this.cache.get(instanceId);
    return cached ? cached.data : null;
  }

  getRaw(instanceId: string): VNextData | null {
    return this.cache.get(instanceId) ?? null;
  }

  getETag(instanceId: string): string | undefined {
    return this.cache.get(instanceId)?.eTag;
  }

  /** Fetch fresh data; returns `null` on failure (loader may also return null). */
  async fetch(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    stateName: string;
  }): Promise<VNextData | null> {
    const ifNoneMatch = this.getETag(input.instanceId);
    const result = await this.loader.loadData({
      ...input,
      ...(ifNoneMatch !== undefined ? { ifNoneMatch } : {}),
    });

    if (!result) {
      this.onLog?.('warn', 'data loader returned null', undefined, {
        workflowName: input.workflowName,
        instanceId: input.instanceId,
      });
      return null;
    }

    if (result.notModified) {
      const cached = this.cache.get(input.instanceId);
      return cached ?? null;
    }

    if (!result.data) return null;

    const payload = result.data as Record<string, unknown>;
    const dataField =
      payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : payload;
    const extensionsField =
      payload.extensions && typeof payload.extensions === 'object'
        ? (payload.extensions as Record<string, unknown>)
        : {};

    const next: VNextData = {
      data: dataField,
      extensions: extensionsField,
      ...(result.eTag !== undefined ? { eTag: result.eTag } : {}),
    };
    this.cache.set(input.instanceId, next);
    return next;
  }

  delete(instanceId: string): void {
    this.cache.delete(instanceId);
  }

  clear(): void {
    this.cache.clear();
  }
}
