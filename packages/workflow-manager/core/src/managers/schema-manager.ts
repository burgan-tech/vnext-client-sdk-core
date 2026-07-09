/**
 * Schema cache + loader orchestration. Backs `SchemaBasedBodyFilter` with the
 * actual transition schema fetched on demand and cached per
 * `(domain, name, instanceId, transitionKey)`.
 */

import type { OnLog, SchemaLoader, VNextTransitionSchema } from '../types.js';
import type { SchemaProvider } from '../filters/schema-based-body-filter.js';

interface CacheEntry {
  schema: VNextTransitionSchema;
  eTag?: string;
}

export class SchemaManager implements SchemaProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly loader: SchemaLoader;
  private readonly onLog?: OnLog;

  constructor(opts: { loader: SchemaLoader; onLog?: OnLog }) {
    this.loader = opts.loader;
    if (opts.onLog) this.onLog = opts.onLog;
  }

  static keyOf(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
  }): string {
    return `${input.workflowDomain}:${input.workflowName}:${input.instanceId}:${input.transitionKey}`;
  }

  async getSchema(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
  }): Promise<VNextTransitionSchema | null> {
    const key = SchemaManager.keyOf(input);
    const ifNoneMatch = this.cache.get(key)?.eTag;
    const result = await this.loader.loadSchema({
      ...input,
      ...(ifNoneMatch !== undefined ? { ifNoneMatch } : {}),
    });

    if (!result) {
      this.onLog?.('warn', 'schema loader returned null', undefined, { ...input });
      return this.cache.get(key)?.schema ?? null;
    }

    if (result.notModified) {
      return this.cache.get(key)?.schema ?? null;
    }

    if (!result.data) return null;

    const raw = result.data as Record<string, unknown>;
    const schema: VNextTransitionSchema = {
      key: typeof raw.key === 'string' ? raw.key : input.transitionKey,
      type: typeof raw.type === 'string' ? raw.type : 'workflow',
      schema:
        raw.schema && typeof raw.schema === 'object' ? (raw.schema as Record<string, unknown>) : {},
    };
    this.cache.set(key, { schema, ...(result.eTag !== undefined ? { eTag: result.eTag } : {}) });
    return schema;
  }


  delete(instanceId: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(`:${instanceId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
