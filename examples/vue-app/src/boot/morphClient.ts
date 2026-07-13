// ─────────────────────────────────────────────────────────────────────────
// morph-api-client wiring (Phase 1 — additive, does not yet replace the stopgap).
//
// Builds a MorphConfig from the backend `environment` record (providers/contexts
// in MorphConfig shape + hosts) and initializes MorphClient. The client is fully
// generic: it knows no provider/context/level — all of that is config. `$vars`
// (idmBase/deviceId/installationId/subject) are resolved from the shared bus.
//
// Later phases route device/login/status/http through this client and delete the
// hand-rolled auth in appHost.
// ─────────────────────────────────────────────────────────────────────────
import { MorphClient, type MorphConfig, type TokenSet } from '@morph/core';
import { oauth2Plugin } from '@morph/oauth2';
import { browserStoragePlugin } from '@morph/browser-storage';
import { loggerPlugin } from '@morph/logger';
import type { AppHost } from '@burgan-tech/app-host';
import { Boundary, Storage, contextStore, getContextValue } from '../sdk/context';
import { CTX } from './constants';

let client: MorphClient | null = null;

/** `$variable` values the config interpolates — all from the shared bus / host state. */
function morphVariables(host: AppHost): Record<string, string> {
  const mem = { boundary: Boundary.device, storage: Storage.memory };
  return {
    idmBase: host.state.idmBase ?? '',
    deviceId: getContextValue<string>(CTX.deviceId, mem) ?? '',
    installationId: getContextValue<string>(CTX.installationId, mem) ?? '',
    subject: contextStore.activeUser ?? '',
  };
}

/** Build MorphConfig from the environment record (providers + hosts). */
function buildMorphConfig(host: AppHost): MorphConfig {
  const env = host.state.environment as unknown as {
    morphConfig?: { providers?: unknown[]; rootCallbackAuthId?: string };
    hosts?: Array<{ key: string; baseUrl: string; allowedAuth?: string[]; headers?: Record<string, string> }>;
  };
  const mc = env.morphConfig ?? {};
  return {
    providers: (mc.providers ?? []) as MorphConfig['providers'],
    hosts: (env.hosts ?? []).map((h) => ({
      key: h.key,
      baseUrl: h.baseUrl,
      allowedAuth: h.allowedAuth ?? [],
      ...(h.headers ? { headers: h.headers } : {}),
    })),
    ...(mc.rootCallbackAuthId ? { rootCallbackAuthId: mc.rootCallbackAuthId } : {}),
  } as MorphConfig;
}

/** Initialize (or re-initialize) the generic MorphClient from backend config. */
export function initMorphClient(host: AppHost): MorphClient {
  const logger = loggerPlugin();
  const storage = browserStoragePlugin('morph', 'session');
  client?.dispose();
  client = MorphClient.init(buildMorphConfig(host), {
    plugins: [logger, storage, oauth2Plugin()],
    variables: morphVariables(host),
    onLog: (level, message) => console.debug(`%c[morph] ${level}: ${message}`, 'color:#8a2be2'),
  });
  return client;
}

export function getMorphClient(): MorphClient | null {
  return client;
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
