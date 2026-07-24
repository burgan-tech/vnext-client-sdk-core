// ─────────────────────────────────────────────────────────────────────────
// Initialization runner — starts the ordered boot workflows declared in
// client-config `initialization[]` (e.g. device-register). Each entry is started
// GENERICALLY: the workflow-manager's x-context-source body filter injects the
// payload from the context-store (optionally overridden by `startData`), so
// there is NO per-flow wiring — the runner just says "start this workflow".
//
// "Headless" is NOT a mode flag — it EMERGES: a boot flow that COMPLETES on its
// sync start (status ≠ active) never touched the UI. A flow that stays ACTIVE
// still has states to drive (e.g. a one-time "update your email" dialog at
// startup) — it is queued in `pendingBootFlows` and rendered by BootFlowHost
// through the SAME WorkflowView mechanism as any nav flow. The experience stays
// uniform — no "works this way here, that way there".
//
// Tolerant by design: an `optional` entry's failure is logged and boot continues.
// ─────────────────────────────────────────────────────────────────────────
import { ref } from 'vue';
import type { WorkflowManager } from 'amorphie-workflow-manager';

export interface InitEntry {
  key: string;
  domain: string;
  version?: string;
  /** Failure does not block boot. */
  optional?: boolean;
  /** Optional guard, e.g. only at a given token level. */
  when?: { tokenLevel?: string };
  /**
   * Constant start payload for this boot flow — the SAME "startData" concept nav
   * items carry as `config.start`. It seeds the start body and OVERRIDES any
   * `x-context-source`-resolved value for the same key (body wins in the
   * workflow-manager's `{ ...resolved, ...body }` merge). Lifecycle per start:
   * fetch schema → resolve x-context-source → override with startData → start.
   */
  startData?: Record<string, unknown>;
}

/** A boot flow that stayed ACTIVE after start → it has UI to surface. Rendered as
 * a modal WorkflowView (open mode) by BootFlowHost; dismissed when it finishes. */
export interface BootFlow {
  id: string;
  domain: string;
  name: string;
  version?: string;
  instanceId: string;
}

/** Reactive queue of UI-surfacing boot flows. BootFlowHost renders + dismisses them. */
export const pendingBootFlows = ref<BootFlow[]>([]);
export function dismissBootFlow(id: string): void {
  pendingBootFlows.value = pendingBootFlows.value.filter((f) => f.id !== id);
}

// An entry runs at most once per token level per session (a token flip re-invokes
// the runner for the new level; this stops a re-flip from re-running/re-popping).
const ranAtLevel = new Set<string>();

export async function runInitialization(
  manager: WorkflowManager,
  entries: InitEntry[],
  ctx: { tokenLevel: string },
): Promise<void> {
  for (const e of entries) {
    if (e.when?.tokenLevel && e.when.tokenLevel !== ctx.tokenLevel) continue;
    const guard = `${e.domain}/${e.key}@${ctx.tokenLevel}`;
    if (ranAtLevel.has(guard)) continue;
    ranAtLevel.add(guard);
    try {
      const res = await manager.startWorkflow({
        domain: e.domain,
        name: e.key,
        ...(e.version ? { version: e.version } : {}),
        attributes: e.startData ?? {},
        sync: true,
      });
      if (res.ok) {
        console.info(`%c[init] ${e.key} started (instance ${res.instanceId ?? '?'}, status ${res.status ?? '?'})`, 'color:#2a9d3f;font-weight:bold');
        // Still ACTIVE ⇒ the flow has states left to drive (a view/dialog to
        // surface) → hand it to the boot-flow host. A terminal status
        // (`completed`/`faulted`) means it was headless. NOTE: the manager maps
        // the wire status to a WORD enum ('active', not 'A').
        if (res.status === 'active' && res.instanceId) {
          pendingBootFlows.value = [
            ...pendingBootFlows.value,
            { id: `${e.key}-${res.instanceId}`, domain: e.domain, name: e.key, version: e.version, instanceId: res.instanceId },
          ];
        }
      } else if (e.optional) {
        console.warn(`[init] ${e.key} failed (optional) — continuing`, res.error ?? res.statusCode);
      } else {
        throw new Error(`[init] ${e.key} failed: ${res.error?.message ?? res.statusCode}`);
      }
    } catch (err) {
      if (!e.optional) throw err;
      console.warn(`[init] ${e.key} threw (optional) — continuing`, err);
    }
  }
}
