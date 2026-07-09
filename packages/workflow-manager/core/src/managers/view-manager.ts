/**
 * Cache for fully-parsed view contents keyed by `instanceId[:transitionKey]`.
 * The cache stores `Record<string, unknown>` (the parsed `content` field) — UI
 * adapters consume it directly.
 */

export class ViewCacheManager {
  private readonly cache = new Map<string, Record<string, unknown>>();
  private readonly etags = new Map<string, string>();

  static keyOf(instanceId: string, transitionKey?: string): string {
    return transitionKey ? `${instanceId}:${transitionKey}` : instanceId;
  }

  set(input: {
    instanceId: string;
    transitionKey?: string;
    content: Record<string, unknown>;
    eTag?: string;
  }): void {
    const key = ViewCacheManager.keyOf(input.instanceId, input.transitionKey);
    this.cache.set(key, input.content);
    if (input.eTag !== undefined) this.etags.set(key, input.eTag);
  }

  get(instanceId: string, transitionKey?: string): Record<string, unknown> | null {
    return this.cache.get(ViewCacheManager.keyOf(instanceId, transitionKey)) ?? null;
  }

  getETag(instanceId: string, transitionKey?: string): string | undefined {
    return this.etags.get(ViewCacheManager.keyOf(instanceId, transitionKey));
  }

  delete(instanceId: string): void {
    for (const key of this.cache.keys()) {
      if (key === instanceId || key.startsWith(`${instanceId}:`)) {
        this.cache.delete(key);
        this.etags.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.etags.clear();
  }
}
