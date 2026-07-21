// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `queryInstances` delegate — pages a workflow's
// instances via the generic workflow-manager (`GET /{domain}/workflows/{wf}/
// instances`). Snapshots pass through as-is; the InstanceList node binds column
// paths into them. Read-only; no solution-specific logic.
// ─────────────────────────────────────────────────────────────────────────
import type { InstanceQuery, InstanceQueryResult } from '@burgan-tech/pseudo-ui';
import type { QueryInstancesInput } from 'amorphie-workflow-manager';
import { workflowManager } from './workflowClient';

export async function queryInstances(input: InstanceQuery): Promise<InstanceQueryResult> {
  const res = await workflowManager.queryInstances({
    domain: input.domain,
    name: input.workflow,
    ...(input.version ? { version: input.version } : {}),
    page: input.page,
    pageSize: input.pageSize,
    ...(input.filter !== undefined ? { filter: input.filter as QueryInstancesInput['filter'] } : {}),
    ...(input.sort !== undefined ? { sort: input.sort as QueryInstancesInput['sort'] } : {}),
  });
  // HAL links: empty `next`/`prev` strings mean end/start of the range. `last`
  // is optional — when present, extract its 1-based page number so the list can
  // offer a "jump to last" control.
  const lastPage = pageOf(res.links?.last);
  return {
    items: (res.items ?? []) as unknown as Record<string, unknown>[],
    hasNext: !!res.links?.next,
    hasPrev: !!res.links?.prev,
    ...(lastPage !== undefined ? { lastPage } : {}),
  };
}

/** Pull the 1-based `page` query param out of a HAL pagination link. */
function pageOf(link: string | undefined): number | undefined {
  if (!link) return undefined;
  const m = /[?&]page=(\d+)/.exec(link);
  return m ? Number(m[1]) : undefined;
}
