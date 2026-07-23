// ─────────────────────────────────────────────────────────────────────────
// Host impl of pseudo-ui's `getTransitionForm` delegate. A transition can carry
// its own FORM (view + schema) to collect input before it fires — e.g. an
// `update` transition that edits the record.
//
// Source is the RUNTIME state endpoint (getAvailableTransitions), NOT the raw
// definition — because the state endpoint is SECURITY-FILTERED (only the
// transitions the caller may fire), and it returns each transition's `view`
// ({hasView, loadData, href}) + `schema` ({hasSchema, href}). We fetch the view
// + schema by href, and when `loadData` (edit) we prefill with the instance's
// current attributes. Returns null when the transition has no form (caller then
// fires it directly).
// ─────────────────────────────────────────────────────────────────────────
import type { DataSchema, ViewDefinition } from '@burgan-tech/pseudo-ui';
import { workflowManager, apiFetch } from './workflowClient';
import { loadSchemaByKey, schemaKeyFromDataSchema } from './schemaCache';

/**
 * The state endpoint gives each transition's view/schema `href` as a FULL backend
 * URL (…/api/v1/{domain}/workflows/{wf}/instances/{id}/functions/view?transitionKey=…).
 * We can't fetch that directly (bypasses the dev proxy) and can't reuse its path
 * verbatim (it already carries `/api/v1`, so apiFetch — which prepends the IDM
 * base — would double it → the /api/v1/api/v1 404). So take ONLY the function name
 * (last path segment) + query from the href and rebuild the proxied path from the
 * known instance coords. Works for absolute or relative hrefs.
 */
function txFunctionPath(href: string | undefined, domain: string, workflow: string, instanceId: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, 'http://_/');
    const fn = u.pathname.split('/').filter(Boolean).pop(); // "view" | "schema"
    if (!fn) return null;
    return `/${domain}/workflows/${workflow}/instances/${instanceId}/functions/${fn}${u.search}`;
  } catch {
    return null;
  }
}

export async function getTransitionForm(input: {
  domain: string;
  workflow: string;
  transitionKey: string;
  instanceId: string;
}): Promise<{ view: ViewDefinition | null; schema: DataSchema | null; validationSchema: DataSchema | null; data: Record<string, unknown>; display?: string } | null> {
  // Security-filtered available transitions (what THIS caller may fire).
  const res = await workflowManager.getAvailableTransitions({
    domain: input.domain,
    name: input.workflow,
    instanceId: input.instanceId,
  });
  const t = (res.transitions ?? []).find((x) => x.key === input.transitionKey);
  if (!t?.view?.hasView) return null; // no form → caller fires the transition directly

  // The `…/functions/view` endpoint returns { key, content, type, display, label }
  // — content/display at the TOP LEVEL (not under `attributes`).
  const viewPath = txFunctionPath(t.view.href, input.domain, input.workflow, input.instanceId);
  if (!viewPath) return null;
  const viewRec = (await apiFetch(viewPath)).data as { content?: unknown; display?: unknown } | null;
  const view = (viewRec?.content as ViewDefinition) ?? null;
  const display = viewRec?.display as string | undefined;

  // Field LABELS come from the view's `dataSchema` (the entity MASTER schema,
  // which carries x-labels) — resolved by key exactly like state views.
  let schema: DataSchema | null = null;
  const schemaKey = schemaKeyFromDataSchema((view as { dataSchema?: unknown } | null)?.dataSchema);
  if (schemaKey) schema = (await loadSchemaByKey(input.domain, schemaKey)) as DataSchema | null;

  // VALIDATION uses the transition's OWN input schema ("only the data it takes"),
  // not the master's stricter required set. Fetched from the transition's schema href.
  let validationSchema: DataSchema | null = null;
  const schemaPath = t.schema?.hasSchema ? txFunctionPath(t.schema.href, input.domain, input.workflow, input.instanceId) : null;
  if (schemaPath) {
    const sd = (await apiFetch(schemaPath)).data as { schema?: unknown; content?: unknown } | null;
    validationSchema = ((sd?.schema ?? sd?.content ?? sd) as DataSchema) ?? null;
  }

  // `loadData` = edit: seed the form with the instance's current attributes.
  let data: Record<string, unknown> = {};
  if (t.view.loadData) {
    const inst = await workflowManager.getInstance({ domain: input.domain, name: input.workflow, instanceId: input.instanceId });
    data = (inst.instance?.attributes ?? {}) as Record<string, unknown>;
  }

  return { view, schema, validationSchema, data, ...(display ? { display } : {}) };
}
