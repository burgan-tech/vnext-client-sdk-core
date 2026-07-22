// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `getInstanceTransitions` + `applyTransition`
// delegates — thin adapters over the generic workflow-manager. The list row's
// ⋯ menu lazy-loads available transitions on open, then triggers them ad-hoc
// (no-form transitions apply directly). Read of state + one-shot apply.
// ─────────────────────────────────────────────────────────────────────────
import { workflowManager } from './workflowClient';

export async function getInstanceTransitions(input: {
  domain: string;
  workflow: string;
  instanceId: string;
}): Promise<Array<{ key: string; hasView?: boolean; hasSchema?: boolean }>> {
  const res = await workflowManager.getAvailableTransitions({
    domain: input.domain,
    name: input.workflow,
    instanceId: input.instanceId,
  });
  return (res.transitions ?? []).map((t) => ({
    key: t.key,
    hasView: !!t.view?.hasView,
    hasSchema: !!t.schema?.hasSchema,
  }));
}

export async function applyTransition(input: {
  domain: string;
  workflow: string;
  instanceId: string;
  transitionKey: string;
  body?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await workflowManager.startTransition({
    domain: input.domain,
    name: input.workflow,
    instanceId: input.instanceId,
    transitionKey: input.transitionKey,
    ...(input.body ? { body: input.body } : {}),
    sync: true,
  });
  return { ok: res.ok, ...(res.error ? { error: String(res.error.message ?? res.error.code ?? 'transition failed') } : {}) };
}
