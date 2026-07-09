import type { TransitionBodyFilter } from '../types.js';

/** Pass-through filter — body sent verbatim. Default when no schema fetch is wanted. */
export class NoOpBodyFilter implements TransitionBodyFilter {
  filterTransitionBody(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return Promise.resolve(input.body);
  }
}
