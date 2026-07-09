// ─────────────────────────────────────────────────────────────────────────
// Client management — thin domain helper over workflow-manager + morph-api.
//
// In morph-idm, each "client" is an instance of the `client` workflow:
//   • list        → workflowManager.queryInstances(...)
//   • change state → workflowManager.startTransition(..., 'passive' | 'publish')
//   • create       → workflowManager.startWorkflow(...)  (→ draft)
// Transition forms are themselves server-driven pseudo-ui views, fetched here
// through the morph-api client (host `morph-idm-api`).
// ─────────────────────────────────────────────────────────────────────────
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import type { VNextInstanceSnapshot } from 'amorphie-workflow-manager';
import { workflowManager, WORKFLOW_DOMAIN, WORKFLOW_NAME } from './workflow';
import { morph, SERVICE_AUTH_ID } from './morph';

export type ClientSnapshot = VNextInstanceSnapshot;

export interface ClientPage {
  ok: boolean;
  items: ClientSnapshot[];
  hasNext: boolean;
  hasPrev: boolean;
  error?: string;
}

/** Clients seeded from migration/fact are "real" — guard them from mutation. */
const PROTECTED_TAGS = ['migration', 'fact'];

export function isProtected(c: ClientSnapshot): boolean {
  return (c.tags ?? []).some((t) => PROTECTED_TAGS.includes(t));
}

export interface StatusAction {
  transitionKey: string;
  label: string;
  /** true = moves the client to a less-available state (needs a stronger confirm). */
  destructive: boolean;
}

/** The primary status transition offered for a given current state. */
export function primaryStatusAction(state: string | undefined): StatusAction | null {
  switch (state) {
    case 'draft':
      return { transitionKey: 'publish', label: 'Publish', destructive: false };
    case 'active':
      return { transitionKey: 'passive', label: 'Deactivate', destructive: true };
    default:
      return null; // passive → only `update`; no direct primary status change
  }
}

export async function listClients(page = 1, pageSize = 10): Promise<ClientPage> {
  const res = await workflowManager.queryInstances({
    domain: WORKFLOW_DOMAIN,
    name: WORKFLOW_NAME,
    page,
    pageSize,
    sort: { field: 'createdAt', direction: 'desc' },
  });
  return {
    ok: res.ok,
    items: res.items ?? [],
    hasNext: Boolean(res.links?.next),
    hasPrev: Boolean(res.links?.prev),
    ...(res.error ? { error: res.error.message } : {}),
  };
}

/** Create a new client (starts a draft instance tagged as a manual sample). */
export async function createClient(clientName: string): Promise<{ ok: boolean; instanceId?: string; error?: string }> {
  const res = await workflowManager.startWorkflow({
    domain: WORKFLOW_DOMAIN,
    name: WORKFLOW_NAME,
    // Distinct, clearly-tagged key so sample clients are easy to spot.
    key: `client-sample-${slug(clientName)}`,
    tags: ['sample', 'manual', 'claude-demo'],
    attributes: { clientName },
  });
  return {
    ok: res.ok,
    ...(res.instanceId ? { instanceId: res.instanceId } : {}),
    ...(res.error ? { error: res.error.message } : {}),
  };
}

/**
 * Fetch a transition's server-driven form view directly through morph-api.
 * Returns the pseudo-ui ViewDefinition (or null if the transition has no view).
 */
export async function fetchTransitionView(
  instanceKey: string,
  transitionKey: string,
): Promise<ViewDefinition | null> {
  const path = `/morph-idm/workflows/client/instances/${encodeURIComponent(instanceKey)}/functions/view?transitionKey=${encodeURIComponent(transitionKey)}`;
  const res = await morph.host('morph-idm-api').get(path, { auth: SERVICE_AUTH_ID });
  const body = res.body as { content?: ViewDefinition } | null;
  return body?.content ?? null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'unnamed';
}
