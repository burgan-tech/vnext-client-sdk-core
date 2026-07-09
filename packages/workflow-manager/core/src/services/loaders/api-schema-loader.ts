/**
 * Default `SchemaLoader` — calls `instanceFunction(fn='schema', transitionKey)`.
 */

import type { LoaderResult, SchemaLoader } from '../../types.js';
import { is304, pickETags } from '../../utils/etag.js';
import type { WorkflowApiService } from '../workflow-api-service.js';

export class ApiSchemaLoader implements SchemaLoader {
  private readonly api: WorkflowApiService;

  constructor(api: WorkflowApiService) {
    this.api = api;
  }

  async loadSchema(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<Record<string, unknown>> | null> {
    try {
      const response = await this.api.instanceFunction({
        domain: input.workflowDomain,
        name: input.workflowName,
        instanceIdOrKey: input.instanceId,
        functionName: 'schema',
        transitionKey: input.transitionKey,
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
