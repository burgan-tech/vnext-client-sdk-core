// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `queryInstances` delegate — pages a workflow's
// instances via the generic workflow-manager (`GET /{domain}/workflows/{wf}/
// instances`). Snapshots pass through as-is; the InstanceList node binds column
// paths into them. Read-only; no solution-specific logic.
// ─────────────────────────────────────────────────────────────────────────
import type { InstanceQuery, InstanceQueryResult } from '@burgan-tech/pseudo-ui';
import type { QueryInstancesInput } from 'amorphie-workflow-manager';
import { idmWorkflowManager } from './idmWorkflow';

export async function queryInstances(input: InstanceQuery): Promise<InstanceQueryResult> {
  const res = await idmWorkflowManager.queryInstances({
    domain: input.domain,
    name: input.workflow,
    ...(input.version ? { version: input.version } : {}),
    page: input.page,
    pageSize: input.pageSize,
    ...(input.filter !== undefined ? { filter: input.filter as QueryInstancesInput['filter'] } : {}),
    ...(input.sort !== undefined ? { sort: input.sort as QueryInstancesInput['sort'] } : {}),
  });
  // HAL links: empty `next`/`prev` strings mean end/start of the range.
  return {
    items: (res.items ?? []) as unknown as Record<string, unknown>[],
    hasNext: !!res.links?.next,
    hasPrev: !!res.links?.prev,
  };
}
