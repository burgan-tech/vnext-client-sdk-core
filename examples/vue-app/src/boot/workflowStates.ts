// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `getWorkflowStates` delegate — thin adapter over the
// generic workflow-manager (`getWorkflowStates`, which reads the workflow's
// definition). Maps the SDK result to the {value,label} option shape pseudo-ui
// renders. Domain-agnostic; read-only.
// ─────────────────────────────────────────────────────────────────────────
import { workflowManager } from './workflowClient';

type StateOption = { value: string; label?: Array<{ language: string; label: string }> };

export async function getWorkflowStates(input: {
  domain: string;
  workflow: string;
  version?: string;
}): Promise<StateOption[]> {
  const res = await workflowManager.getWorkflowStates(input);
  return res.states.map((s) => ({ value: s.key, ...(s.labels ? { label: s.labels } : {}) }));
}
