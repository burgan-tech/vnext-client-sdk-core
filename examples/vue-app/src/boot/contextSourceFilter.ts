// ─────────────────────────────────────────────────────────────────────────
// x-context-source body filter — the workflow-manager feature that wires every
// start/transition payload from backend schema annotations, with ZERO per-flow
// client code. Registered as the manager's `transitionBodyFilter`, so it runs on
// EVERY start and transition (init, login, change-password, tabs — all of them).
//
// For a given (workflow, transitionKey) it resolves the transition's input schema
// and injects the values the client already holds (context-store) into the body:
//   • schema fetch is uniform for start AND transitions — read the workflow
//     definition (sys-flows), find the transition (startTransition or by key),
//     follow its schema ref, fetch the schema (sys-schemas). No instance needed.
//   • x-context-source properties are resolved via the generic app-host resolver.
// Definitions + schemas are immutable per key → cached per session.
// ─────────────────────────────────────────────────────────────────────────
import type { TransitionBodyFilter } from 'amorphie-workflow-manager';
import { resolveContextSource, type ContextSourceReaders } from '@burgan-tech/app-host';
import { Boundary, Storage, contextStore, getContextValue } from '../sdk/context';
import { apiFetch } from './workflowClient';
import { attrsOf, loadSchemaByKey } from './schemaCache';

// ── Workflow-definition resolution (find a transition's schema ref, no instance) ──
type SchemaRef = { key?: string; domain?: string };
type Transition = { key?: string; schema?: SchemaRef | null };
type WorkflowDef = {
  startTransition?: Transition;
  states?: Array<{ transitions?: Transition[] }>;
  sharedTransitions?: Transition[];
};

const defCache = new Map<string, Promise<WorkflowDef | null>>();
function loadDef(domain: string, workflow: string): Promise<WorkflowDef | null> {
  const k = `${domain}:${workflow}`;
  let p = defCache.get(k);
  if (!p) {
    p = apiFetch(`/${domain}/workflows/sys-flows/instances/${workflow}`, { query: { sync: 'true' } })
      .then((r) => (r.ok ? (attrsOf(r.data) as WorkflowDef) : null))
      .catch(() => null);
    defCache.set(k, p);
  }
  return p;
}

function findTransition(def: WorkflowDef, transitionKey: string): Transition | null {
  if (transitionKey === 'start') return def.startTransition ?? null;
  for (const st of def.states ?? []) for (const t of st.transitions ?? []) if (t.key === transitionKey) return t;
  for (const t of def.sharedTransitions ?? []) if (t.key === transitionKey) return t;
  return null;
}

// ── Context-store readers (ambient values live in device/memory) ────────────
const readers: ContextSourceReaders = {
  readContext: (boundary, key) =>
    getContextValue(key, { boundary: Boundary[boundary], storage: Storage.memory }),
  // subject = customer/scope, user = actor (see subject/actor identity model).
  readIdentity: (kind) => (kind === 'subject' ? contextStore.activeSubject : contextStore.activeUser),
};

export const contextSourceBodyFilter: TransitionBodyFilter = {
  async filterTransitionBody({ workflowDomain, workflowName, transitionKey, body }) {
    try {
      const def = await loadDef(workflowDomain, workflowName);
      const ref = def && findTransition(def, transitionKey)?.schema;
      if (!ref?.key) return body;
      const schema = await loadSchemaByKey(ref.domain ?? workflowDomain, ref.key);
      if (!schema) return body;
      const resolved = resolveContextSource(schema, readers);
      // Resolved x-context-source values fill fields the caller doesn't supply;
      // an explicit body value always wins (user input / form fields).
      return { ...resolved, ...body };
    } catch {
      return body; // never block a workflow call on resolution failure
    }
  },
};
