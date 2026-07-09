/**
 * Default `DataLoader` — calls `instanceFunction(fn='data')` and returns a
 * uniform `LoaderResult` envelope.
 */

import type { DataLoader, LoaderResult } from '../../types.js';
import { is304, pickETags } from '../../utils/etag.js';
import type { WorkflowApiService } from '../workflow-api-service.js';

export class ApiDataLoader implements DataLoader {
  private readonly api: WorkflowApiService;
  private readonly defaultExtensions?: string[];

  constructor(api: WorkflowApiService, opts: { defaultExtensions?: string[] } = {}) {
    this.api = api;
    if (opts.defaultExtensions !== undefined) this.defaultExtensions = opts.defaultExtensions;
  }

  async loadData(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    stateName: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<Record<string, unknown>> | null> {
    try {
      const response = await this.api.instanceFunction({
        domain: input.workflowDomain,
        name: input.workflowName,
        instanceIdOrKey: input.instanceId,
        functionName: 'data',
        ...(this.defaultExtensions && this.defaultExtensions.length > 0
          ? { extensions: this.defaultExtensions }
          : {}),
        ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
      });

      const eTags = pickETags(response);

      if (is304(response)) {
        return { data: null, notModified: true, ...(input.ifNoneMatch !== undefined ? { eTag: input.ifNoneMatch } : {}) };
      }

      if (!response.ok) return null;

      return {
        data: (response.data as Record<string, unknown>) ?? null,
        ...(eTags.eTag !== undefined ? { eTag: eTags.eTag } : {}),
      };
    } catch {
      return null;
    }
  }
}
