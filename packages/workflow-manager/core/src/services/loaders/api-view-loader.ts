/**
 * Default `ViewLoader` — calls `instanceFunction(fn='view', transitionKey?=key)`.
 */

import type { LoaderResult, ViewLoader, VNextViewReference, VNextViewResponse } from '../../types.js';
import { is304, pickETags } from '../../utils/etag.js';
import { parseViewResponse } from '../../utils/response.js';
import type { WorkflowApiService } from '../workflow-api-service.js';

export class ApiViewLoader implements ViewLoader {
  private readonly api: WorkflowApiService;

  constructor(api: WorkflowApiService) {
    this.api = api;
  }

  async loadViewByReference(input: {
    viewRef: VNextViewReference;
    instanceId: string;
    transitionKey?: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<VNextViewResponse> | null> {
    try {
      const response = await this.api.instanceFunction({
        domain: input.viewRef.domain,
        name: input.viewRef.flow,
        instanceIdOrKey: input.instanceId,
        functionName: 'view',
        ...(input.viewRef.flowVersion ? { version: input.viewRef.flowVersion } : {}),
        ...(input.transitionKey !== undefined ? { transitionKey: input.transitionKey } : {}),
        ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
      });

      const eTags = pickETags(response);

      if (is304(response)) {
        return { data: null, notModified: true, ...(input.ifNoneMatch !== undefined ? { eTag: input.ifNoneMatch } : {}) };
      }

      if (!response.ok) return null;

      return {
        data: parseViewResponse(response),
        ...(eTags.eTag !== undefined ? { eTag: eTags.eTag } : {}),
      };
    } catch {
      return null;
    }
  }
}
