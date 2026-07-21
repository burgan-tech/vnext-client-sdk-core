// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `getWorkflowStates` delegate — the selectable states
// for an InstanceList `state`-type column filter. Read off the workflow
// definition (sys-flows); each state contributes its key + localized labels.
// Cached per workflow (definitions are immutable per version). Read-only.
// ─────────────────────────────────────────────────────────────────────────
import { idmFetch } from './idmWorkflow';
import { attrsOf } from './schemaCache';

type StateDef = { key?: string; labels?: Array<{ language: string; label: string }> };
type StateOption = { value: string; label?: Array<{ language: string; label: string }> };

const cache = new Map<string, Promise<StateOption[]>>();

export function getWorkflowStates(input: {
  domain: string;
  workflow: string;
  version?: string;
}): Promise<StateOption[]> {
  const k = `${input.domain}:${input.workflow}`;
  let p = cache.get(k);
  if (!p) {
    p = idmFetch(`/${input.domain}/workflows/sys-flows/instances/${input.workflow}`, {
      query: { sync: 'true' },
    })
      .then((r) => {
        if (!r.ok) return [];
        const def = attrsOf(r.data) as { states?: StateDef[] };
        return (def.states ?? [])
          .filter((s): s is StateDef & { key: string } => typeof s.key === 'string' && s.key.length > 0)
          .map((s) => ({ value: s.key, ...(s.labels ? { label: s.labels } : {}) }));
      })
      .catch(() => [] as StateOption[]);
    cache.set(k, p);
  }
  return p;
}
