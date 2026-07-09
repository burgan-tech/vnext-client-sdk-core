/**
 * Inject helper — typed wrapper around Vue's `inject(key)` that throws an
 * informative error when the host forgot to `provide` the manager.
 */

import { inject, type InjectionKey } from 'vue';
import type { WorkflowManager } from 'amorphie-workflow-manager';

/** Recommended `provide`/`inject` key for the singleton WorkflowManager. */
export const WorkflowManagerKey: InjectionKey<WorkflowManager> = Symbol('amorphie:workflowManager');

export function useInjectWorkflowManager(): WorkflowManager {
  const wm = inject(WorkflowManagerKey);
  if (!wm) {
    throw new Error(
      "useInjectWorkflowManager(): no WorkflowManager provided. " +
        "Call `app.provide(WorkflowManagerKey, manager)` in main.ts.",
    );
  }
  return wm;
}
