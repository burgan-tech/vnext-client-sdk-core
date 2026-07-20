// ─────────────────────────────────────────────────────────────────────────
// Initialization runner — runs the ordered, headless boot workflows declared in
// client-config `initialization[]` (e.g. device-register). Each entry is started
// GENERICALLY: the workflow-manager's x-context-source body filter injects the
// whole payload from the client's context-store, so there is NO per-flow wiring
// here — the runner just says "start this workflow".
//
// Tolerant by design: an `optional` entry's failure is logged and boot continues.
// ─────────────────────────────────────────────────────────────────────────
import type { WorkflowManager } from 'amorphie-workflow-manager';

export interface InitEntry {
  key: string;
  domain: string;
  version?: string;
  /** Informational: these flows run with no UI. */
  mode?: string;
  /** Failure does not block boot. */
  optional?: boolean;
  /** Optional guard, e.g. only at a given token level. */
  when?: { tokenLevel?: string };
}

export async function runInitialization(
  manager: WorkflowManager,
  entries: InitEntry[],
  ctx: { tokenLevel: string },
): Promise<void> {
  for (const e of entries) {
    if (e.when?.tokenLevel && e.when.tokenLevel !== ctx.tokenLevel) continue;
    try {
      // attributes: {} — the x-context-source filter fills the payload from context.
      const res = await manager.startWorkflow({
        domain: e.domain,
        name: e.key,
        ...(e.version ? { version: e.version } : {}),
        attributes: {},
        sync: true,
      });
      if (res.ok) {
        console.info(`%c[init] ${e.key} started (instance ${res.instanceId ?? '?'})`, 'color:#2a9d3f;font-weight:bold');
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
