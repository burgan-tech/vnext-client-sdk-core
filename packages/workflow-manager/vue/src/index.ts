/**
 * Public surface of `amorphie-workflow-manager-vue`.
 *
 * The core SDK (`amorphie-workflow-manager`) and Vue itself stay as peer
 * dependencies — host apps install them once and this package re-exports the
 * Vue-side helpers only.
 */

export { useWorkflow } from './use-workflow.js';
export { WorkflowManagerKey, useInjectWorkflowManager } from './inject-key.js';

export type {
  UseWorkflowOptions,
  UseWorkflowReturn,
  ScopedStartInput,
  ScopedTransitionInput,
  ScopedRetryInput,
  ScopedContinueInput,
  ScopedStateChangedEvent,
} from './types.js';
