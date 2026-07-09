import type { ContextStoreOptions } from './types';

export class ServerTimeManager {
  private cachedTime: Date | null = null;
  private cachedAt = 0;
  private ttl: number;
  private urls: string[];
  private timeout: number;
  private delegate: ContextStoreOptions['onRequestServerTime'];
  private log: ContextStoreOptions['onLog'];
  private fetchPromise: Promise<Date> | null = null;

  constructor(options: ContextStoreOptions) {
    this.ttl = options.serverTimeTtl ?? 30 * 60 * 1000;
    this.urls = options.timeServerUrls;
    this.timeout = options.requestServerTimeTimeout ?? 5000;
    this.delegate = options.onRequestServerTime;
    this.log = options.onLog;
  }

  async getServerTime(): Promise<Date> {
    if (this.cachedTime && !this.isCacheExpired()) {
      return this.offsetFromCache();
    }

    try {
      if (!this.fetchPromise) {
        this.fetchPromise = this.fetchFromServers();
      }
      const time = await this.fetchPromise;
      this.fetchPromise = null;
      return time;
    } catch (err) {
      this.fetchPromise = null;
      this.log?.('error', 'Server time fetch failed, falling back to device time', err);
      return new Date();
    }
  }

  /** Synchronous best-effort: cached time or device time. Used internally for envelope timestamps. */
  getNow(): Date {
    if (this.cachedTime && !this.isCacheExpired()) {
      return this.offsetFromCache();
    }
    return new Date();
  }

  private isCacheExpired(): boolean {
    return performance.now() - this.cachedAt > this.ttl;
  }

  private offsetFromCache(): Date {
    const elapsed = performance.now() - this.cachedAt;
    return new Date(this.cachedTime!.getTime() + elapsed);
  }

  private async fetchFromServers(): Promise<Date> {
    const results = await Promise.allSettled(
      this.urls.map((url) => this.delegate(url, this.timeout)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        this.cachedTime = r.value;
        this.cachedAt = performance.now();
        this.log?.('debug', 'Server time synced', undefined, { time: r.value.toISOString() });
        return r.value;
      }
    }

    throw new Error('All server time requests failed');
  }
}
