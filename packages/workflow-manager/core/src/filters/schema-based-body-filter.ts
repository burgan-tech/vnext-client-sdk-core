/**
 * Filter transition bodies through the JSON Schema fetched for the active
 * `transitionKey`. On schema-fetch failure, body passes through verbatim and a
 * warning is logged via `OnLog` (consumer-supplied).
 */

import type { OnLog, TransitionBodyFilter, VNextTransitionSchema } from '../types.js';
import { SchemaFilter } from '../utils/schema-filter.js';

export interface SchemaProvider {
  /** Resolve and cache schema for the (instance, transitionKey) pair. */
  getSchema(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
  }): Promise<VNextTransitionSchema | null>;
}

export class SchemaBasedBodyFilter implements TransitionBodyFilter {
  private readonly provider: SchemaProvider;
  private readonly onLog?: OnLog;

  constructor(opts: { provider: SchemaProvider; onLog?: OnLog }) {
    this.provider = opts.provider;
    if (opts.onLog) this.onLog = opts.onLog;
  }

  async filterTransitionBody(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let schema: VNextTransitionSchema | null = null;
    try {
      schema = await this.provider.getSchema({
        workflowDomain: input.workflowDomain,
        workflowName: input.workflowName,
        instanceId: input.instanceId,
        transitionKey: input.transitionKey,
      });
    } catch (e) {
      this.onLog?.('warn', 'schema fetch threw; passing body through', e, {
        workflowDomain: input.workflowDomain,
        workflowName: input.workflowName,
        instanceId: input.instanceId,
        transitionKey: input.transitionKey,
      });
    }

    if (!schema) {
      this.onLog?.('warn', 'schema not available; passing body through', undefined, {
        workflowName: input.workflowName,
        transitionKey: input.transitionKey,
      });
      return input.body;
    }

    return SchemaFilter.filterBodyBySchema({ body: input.body, schema });
  }
}
