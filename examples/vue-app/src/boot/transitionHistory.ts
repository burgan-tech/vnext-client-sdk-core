// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `getTransitionHistory` delegate — thin adapter over
// the generic workflow-manager. Maps SDK history entries to the {transitionKey,
// fromState, toState, at, triggerType} shape pseudo-ui renders. Read-only.
// ─────────────────────────────────────────────────────────────────────────
import type { TransitionHistoryItem } from '@burgan-tech/pseudo-ui';
import { workflowManager } from './workflowClient';

export async function getTransitionHistory(input: {
  domain: string;
  workflow: string;
  instanceId: string;
}): Promise<TransitionHistoryItem[]> {
  const res = await workflowManager.getTransitionHistory({
    domain: input.domain,
    name: input.workflow,
    instanceId: input.instanceId,
  });
  return (res.transitions ?? []).map((e) => ({
    transitionKey: e.transitionKey,
    fromState: e.fromState,
    toState: e.toState,
    ...(e.startedAt ?? e.createdAt ? { at: e.startedAt ?? e.createdAt } : {}),
    ...(e.triggerType ? { triggerType: e.triggerType } : {}),
    raw: e, // full backend record for the `{ }` raw viewer
  }));
}
