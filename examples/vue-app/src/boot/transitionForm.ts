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
  if (!t) return null; // not available to this caller

  // ⚠️ TEMPORARY WORKAROUND — REMOVE once the runtime bug is fixed (platform team,
  // ETA ~2026-07-24). BUG: the runtime reports `view.hasView:false` for a
  // WIZARD-state (stateType 5) transition even when it HAS a view — confirmed on
  // shell runtime 0.0.68 AND 0.0.71 (a NON-wizard transition correctly reports
  // true; a wizard STATE view also reports true). So `t.view.hasView` can't be
  // trusted yet. Until the fix ships we ground-truth the form on the view endpoint
  // itself: 200 + content ⇒ there IS a form (open it); 404 "View definition not
  // found" ⇒ no view ⇒ fire the transition directly.
  // WHEN FIXED: delete this fetch-to-detect and restore the strict binding
  //   `if (!t?.view?.hasView) return null;`  then build the viewPath as before.
  // The `…/functions/view` endpoint returns { key, content, type, display, label }
  // — content/display at the TOP LEVEL (not under `attributes`).
  const viewPath =
    txFunctionPath(t.view?.href, input.domain, input.workflow, input.instanceId) ??
    `/${input.domain}/workflows/${input.workflow}/instances/${input.instanceId}/functions/view?transitionKey=${encodeURIComponent(input.transitionKey)}`;
  const viewResp = await apiFetch(viewPath);
  const viewRec = viewResp.ok ? (viewResp.data as { content?: unknown; display?: unknown } | null) : null;
  const view = (viewRec?.content as ViewDefinition) ?? null;
  if (!view) return null; // no form → caller fires the transition directly
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

  // `loadData` = edit: seed the form with the instance's current attributes. Read
  // from the LIVE `functions/data` endpoint (shape { data, eTag, … }) — NOT the
  // bare `GET …/instances/{id}`, which is a read-model projection that lags right
  // after a transition and 404s (breaking the wizard auto-advance). Best-effort:
  // a prefill failure must NEVER block the form from opening.
  let data: Record<string, unknown> = {};
  if (t.view?.loadData) {
    try {
      const dataPath = `/${input.domain}/workflows/${input.workflow}/instances/${input.instanceId}/functions/data`;
      const dataResp = await apiFetch(dataPath, { query: { sync: 'true' } });
      if (dataResp.ok) data = ((dataResp.data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    } catch {
      /* prefill is best-effort — open the form empty rather than fail */
    }
  }

  return { view, schema, validationSchema, data, ...(display ? { display } : {}) };
}
