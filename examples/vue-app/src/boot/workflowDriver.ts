// ─────────────────────────────────────────────────────────────────────────
// Generic workflow driver for pseudo-ui `WorkflowView` nodes.
//
// pseudo-ui renders each workflow state's server-defined view; this host glue
// owns the workflow client (start/transition/terminal) and returns a reactive
// `WorkflowSession` the renderer reads + submits into. The only solution-
// specific bit is the 2FA login success path (PKCE redeem → token-level flip).
//
// This is ORCHESTRATION, not UI — no markup lives here.
// ─────────────────────────────────────────────────────────────────────────
import { computed, ref, watch } from 'vue';
import { useWorkflow } from 'amorphie-workflow-manager-vue';
import type { DataSchema, ViewDefinition, WorkflowSession, WorkflowViewConfig } from '@burgan-tech/pseudo-ui';
import { loadSchemaByKey, schemaKeyFromDataSchema } from './schemaCache';
import type { TokenLevel } from '@burgan-tech/app-host';
import { workflowManager } from './workflowClient';
import { createPkce, type Pkce } from './pkce';
import { completeLogin } from './login';
import { getInteractiveLoginWorkflow } from './morphClient';
import { contextStore } from '../sdk/context';

export interface WorkflowDriverOptions {
  /** Flip the app to a new token level after an interactive login succeeds. */
  setTokenLevel?: (level: TokenLevel) => void;
}

/**
 * pseudo-ui view buttons carry `command` as a raw transition key ("login") or a
 * URN ("urn:morph-idm:workflow:user-login:login"). The transition endpoint
 * expects the bare key, so take the last URN segment.
 */
function transitionKeyFrom(command: string): string {
  return command.startsWith('urn:') ? (command.split(':').pop() ?? command) : command;
}

/** Build a `delegate.driveWorkflow` implementation bound to host session controls. */
export function makeDriveWorkflow(opts: WorkflowDriverOptions = {}) {
  return (config: WorkflowViewConfig): WorkflowSession => {
    const wf = useWorkflow({
      manager: workflowManager,
      domain: config.domain,
      name: config.name,
      ...(config.version ? { version: config.version } : {}),
    });

    // authorization_code login needs PKCE (codeChallenge on `login`, verifier at redeem).
    const pkceEnabled = (config.start?.['grantType'] as string | undefined) === 'authorization_code';
    let pkce: Pkce | undefined;
    const instanceId = ref<string | undefined>();

    const view = computed<ViewDefinition | null>(() => (wf.view.value?.content ?? null) as ViewDefinition | null);
    const data = computed<Record<string, unknown>>(() => (wf.data.value ?? {}) as Record<string, unknown>);

    // Resolve each view's transition schema (from its `dataSchema` ref) so the
    // renderer gets x-labels + validation. Re-resolves whenever the view changes.
    const schema = ref<DataSchema | null>(null);
    watch(
      view,
      async (v) => {
        const key = schemaKeyFromDataSchema((v as { dataSchema?: unknown } | null)?.dataSchema);
        schema.value = key ? ((await loadSchemaByKey(config.domain, key)) as DataSchema | null) : null;
      },
      { immediate: true },
    );
    const ready = computed<boolean>(() => wf.ready.value);
    const error = computed<string>(() => {
      const e = wf.error.value as unknown;
      if (!e) return '';
      if (typeof e === 'string') return e;
      const o = e as { message?: string; detail?: string; code?: string };
      return o.message ?? o.detail ?? o.code ?? JSON.stringify(e);
    });

    // Surface a terminal success (e.g. login-success) → redeem token + flip level.
    watch(
      () => [wf.isTerminal.value, wf.currentState.value] as const,
      async ([terminal, state]) => {
        if (!((terminal || String(state ?? '').includes('success')) && instanceId.value)) return;
        if (pkceEnabled && pkce) {
          const tokens = await completeLogin(instanceId.value, pkce.codeVerifier);
          // The level a completed interactive login grants = the interactive
          // context's key from config (e.g. "2fa"), not a hardcoded literal.
          const level = getInteractiveLoginWorkflow()?.contextKey;
          if (tokens && level) opts.setTokenLevel?.(level);
        }
      },
    );

    return {
      view,
      schema,
      data,
      ready,
      error,
      async start(values) {
        if (pkceEnabled) pkce = await createPkce();
        // Some flows (e.g. user-change-password) resolve the subject from the
        // instance key, so start keyed by the logged-in userId.
        const key = config.keyFrom === 'activeUser' ? (contextStore.activeUser ?? undefined) : undefined;
        const res = await wf.start({
          attributes: { ...(config.start ?? {}), ...(values ?? {}) },
          ...(key ? { key } : {}),
          sync: true,
        });
        if (res.ok && res.instanceId) instanceId.value = res.instanceId;
      },
      async open(id) {
        // Detail/read: load an existing instance and render its current-state view.
        instanceId.value = id;
        await wf.continueWith({ instanceId: id });
      },
      async submit(command, body) {
        const key = transitionKeyFrom(command);
        // PKCE: attach the codeChallenge on the `login` transition.
        const payload =
          pkce && key === 'login'
            ? { ...body, codeChallenge: pkce.codeChallenge, codeChallengeMethod: pkce.codeChallengeMethod }
            : body;
        await wf.transition({ transitionKey: key, body: payload, sync: true });
      },
      dispose() {
        // useWorkflow tears down its listeners on scope dispose; nothing extra.
      },
    };
  };
}
