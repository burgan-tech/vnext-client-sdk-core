// ─────────────────────────────────────────────────────────────────────────
// morph-api-client wiring — the generic auth layer.
//
// Builds a MorphConfig from the backend `environment` record (providers/contexts
// in MorphConfig shape + hosts) and initializes MorphClient. The client is fully
// generic: it knows no provider/context/level — all of that is config. `$vars`
// (idmBase/deviceId/installationId/subject) are resolved from the shared bus.
//
// Initialized early (right after the environment is fetched, before token-level
// resolution) so getTokenStatus is authoritative for the token level + nav.
// ─────────────────────────────────────────────────────────────────────────
import { MorphClient, type MorphConfig, type TokenSet } from '@morph/core';
import { oauth2Plugin } from '@morph/oauth2';
import { browserStoragePlugin } from '@morph/browser-storage';
import { loggerPlugin } from '@morph/logger';
import type { EnvironmentResponse, LocalizedText } from '@burgan-tech/app-host';
import { Boundary, Storage, contextStore, getContextValue } from '../sdk/context';
import { CTX } from './constants';

let client: MorphClient | null = null;
let lastEnv: EnvironmentResponse | null = null;
let lastIdmBase: string | undefined;

/** `$variable` values the config interpolates — all from the shared bus. */
function morphVariables(idmBase: string | undefined): Record<string, string> {
  const mem = { boundary: Boundary.device, storage: Storage.memory };
  return {
    idmBase: idmBase ?? '',
    deviceId: getContextValue<string>(CTX.deviceId, mem) ?? '',
    installationId: getContextValue<string>(CTX.installationId, mem) ?? '',
    subject: contextStore.activeUser ?? '',
  };
}

/** Build MorphConfig from the environment record (providers + hosts). */
function buildMorphConfig(env: EnvironmentResponse): MorphConfig {
  const mc = env.morphConfig ?? {};
  return {
    providers: (mc.providers ?? []) as MorphConfig['providers'],
    hosts: (env.hosts ?? []).map((h) => ({
      key: h.key,
      baseUrl: h.baseUrl,
      allowedAuth: (h.allowedAuth as string[] | undefined) ?? [],
      ...(h.headers ? { headers: h.headers as Record<string, string> } : {}),
    })),
    ...(mc.rootCallbackAuthId ? { rootCallbackAuthId: mc.rootCallbackAuthId } : {}),
  } as MorphConfig;
}

/** Initialize (or re-initialize) the generic MorphClient from backend config. */
export function initMorphClient(env: EnvironmentResponse, idmBase: string | undefined): MorphClient {
  lastEnv = env;
  lastIdmBase = idmBase;
  const logger = loggerPlugin();
  const storage = browserStoragePlugin('morph', 'session');
  client?.dispose();
  client = MorphClient.init(buildMorphConfig(env), {
    plugins: [logger, storage, oauth2Plugin()],
    variables: morphVariables(idmBase),
    onLog: (level, message) => console.debug(`%c[morph] ${level}: ${message}`, 'color:#8a2be2'),
  });
  return client;
}

/** Re-init with refreshed variables (e.g. `subject` after login) so subject-scoped
 * storage keys resolve correctly. Persisted tokens survive (same storage prefix). */
export function reinitMorphClient(): MorphClient | null {
  if (!lastEnv) return client;
  return initMorphClient(lastEnv, lastIdmBase);
}

export function getMorphClient(): MorphClient | null {
  return client;
}

/** Token levels declared in morphConfig, in privilege order (highest first),
 * each with a localizable label. Backing data for the token switch + status. */
export interface TokenLevelDef {
  key: string;
  label?: LocalizedText;
}
export function getTokenLevels(): TokenLevelDef[] {
  const raw = (lastEnv?.morphConfig?.tokenLevels ?? []) as Array<string | TokenLevelDef>;
  // Tolerate the older plain-string form.
  return raw.map((t) => (typeof t === 'string' ? { key: t } : t));
}

/** Just the level keys in privilege order — drives resolveTokenLevel. */
export function getTokenLevelOrder(): string[] {
  return getTokenLevels().map((t) => t.key);
}

/**
 * The interactive login workflow ref (`{ domain, workflow }`) declared in
 * morphConfig — the context whose `delegateMetadata.interaction` is "interactive"
 * (e.g. "morph-idm/user-login"). Lets the login flow locate/redeem tokens without
 * hardcoding the solution domain/workflow names.
 */
export function getInteractiveLoginWorkflow(): { domain: string; workflow: string; contextKey: string } | null {
  type Ctx = { key?: string; delegateMetadata?: { workflow?: string; interaction?: string } };
  const providers = (lastEnv?.morphConfig?.providers ?? []) as Array<{ contexts?: Ctx[] }>;
  for (const p of providers) {
    for (const c of p.contexts ?? []) {
      const dm = c.delegateMetadata;
      if (dm?.interaction === 'interactive' && dm.workflow) {
        const [domain, workflow] = dm.workflow.split('/');
        if (domain && workflow) return { domain, workflow, contextKey: c.key ?? '' };
      }
    }
  }
  return null;
}

/** The primary interactive login auth id (config `rootCallbackAuthId`, e.g.
 * "morph-idm/2fa") — where a completed login flow's tokens are handed off. */
export function getLoginAuthId(): string | null {
  return (lastEnv?.morphConfig?.rootCallbackAuthId as string | undefined) ?? null;
}

/**
 * Hand a token acquired by a host-run vNext workflow to the client, which then
 * owns it (storage, status, request attachment). authId = "providerKey/contextKey"
 * (e.g. "morph-idm/device", "morph-idm/2fa"). Tolerant — never blocks the flow.
 */
export async function setMorphTokens(authId: string, tokens: TokenSet): Promise<void> {
  if (!client) return;
  try {
    await client.auth(authId).setTokens(tokens);
  } catch (e) {
    console.warn(`[morph] setTokens(${authId}) failed`, e);
  }
}
