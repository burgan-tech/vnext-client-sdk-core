// ─────────────────────────────────────────────────────────────────────────
// Discovery chain — the "new glue" that boots an app from a single clientId.
//
//   clientId → environment(record) → (device token, best-effort)
//            → client-config(record) → tokenLevel
//            → navigation(sidebar + profile records for that level)
//
// Config is DATA, not code: environment / client-config / navigation are all
// held as instances of config-carrying workflows and fetched BY KEY
// (GET /workflows/<workflow>/instances/<key>), exactly like themes and views.
// There are no C# functions/mappings on the boot path.
// ─────────────────────────────────────────────────────────────────────────
import type {
  AppHostConfig,
  AppHostDeps,
  AppHostState,
  ClientConfig,
  EnvironmentResponse,
  EnvironmentStage,
  LevelConfig,
  NavItem,
  NavigationResponse,
  TokenLevel,
} from './types.js';

/** Fetch a config record's instance data (attributes) by key. */
export async function loadRecord(
  deps: AppHostDeps,
  workflow: string,
  key: string,
): Promise<Record<string, unknown> | undefined> {
  const raw = (await deps.fetchJson(`/workflows/${workflow}/instances/${key}`, {
    query: { sync: 'true' },
  })) as { attributes?: Record<string, unknown> } | undefined;
  return raw?.attributes;
}

function pickStage(env: EnvironmentResponse): EnvironmentStage {
  const stage =
    (env.defaultStage && env.stages.find((s) => s.key === env.defaultStage)) || env.stages[0];
  if (!stage) throw new Error('[app-host] environment returned no stages');
  return stage;
}

/** Resolve the level manifest for a token level (1fa falls back to 2fa, then device). */
export function resolveLevel(clientConfig: ClientConfig, tokenLevel: TokenLevel): LevelConfig {
  const levels = clientConfig.levels ?? {};
  const level = levels[tokenLevel] ?? levels['2fa'] ?? levels['device'];
  if (!level) throw new Error(`[app-host] client-config has no level manifest for "${tokenLevel}"`);
  return level;
}

/** Shell mode for a level — backend-declared in the level manifest (not a client rule). */
export function resolveShellMode(clientConfig: ClientConfig, tokenLevel: TokenLevel): 'sdi' | 'mdi' {
  return resolveLevel(clientConfig, tokenLevel).shellMode ?? 'sdi';
}

/** Base URL of a named host from the environment `hosts` (config home for URLs). */
export function resolveHostBase(env: EnvironmentResponse, key: string): string | undefined {
  return env.hosts?.find((h) => h.key === key)?.baseUrl;
}

/** Load the resolved navigation (master + homepage + sidebar/profile records) for a level. */
export async function loadNavigation(
  deps: AppHostDeps,
  clientConfig: ClientConfig,
  tokenLevel: TokenLevel,
): Promise<NavigationResponse> {
  const level = resolveLevel(clientConfig, tokenLevel);
  const items = async (wf: string, key: string): Promise<NavItem[]> =>
    ((await loadRecord(deps, wf, key))?.['items'] as NavItem[] | undefined) ?? [];

  // The two nav records are independent — fetch them concurrently.
  const [sidebar, profile] = await Promise.all([
    items(level.nav.sidebar.workflow ?? 'navigation', level.nav.sidebar.key),
    items(level.nav.profile.workflow ?? 'navigation', level.nav.profile.key),
  ]);

  return {
    ...(level.masterLayout ? { masterLayout: level.masterLayout as Record<string, unknown> } : {}),
    homepage: level.homepage,
    sidebar,
    profile,
  };
}

export async function discover(config: AppHostConfig, deps: AppHostDeps): Promise<AppHostState> {
  const log = deps.log ?? (() => undefined);
  const { clientId } = config;

  // 1. environment record — the first call (keyed by clientId).
  log('info', `discovering environment for clientId=${clientId}`);
  const environment = (await loadRecord(deps, 'environment', clientId)) as EnvironmentResponse | undefined;
  if (!environment?.stages) throw new Error(`[app-host] environment record "${clientId}" not found`);
  const stage = pickStage(environment);
  log('info', `stage selected: ${stage.key}`);

  // IDM host base — single source of truth is the environment `hosts` config.
  const idmBase = resolveHostBase(environment, 'idm');
  // Device-context endpoints from the morph-api config (no client-side path building).
  const deviceCtx = (environment.morphConfig?.providers ?? [])
    .flatMap((p) => p.contexts ?? [])
    .find((c) => c.key === 'device');
  const provisioningEndpoint = deviceCtx?.provisioning?.endpoint;
  const tokenEndpoint = deviceCtx?.token?.endpoint;

  // 2. device identity (deviceId/installationId/...) — resolved before any token.
  const deviceIdentity = deps.resolveIdentity?.();
  if (deviceIdentity) {
    log('info', `device identity: deviceId=${deviceIdentity.deviceId} installationId=${deviceIdentity.installationId}`);
  }

  // client-config only needs the clientId (not the device token), so fetch it
  // concurrently with the slow device registration/token round-trips below.
  const clientConfigPromise = loadRecord(deps, 'client-config', clientId);

  // 3. device registration (device-manager) — ensures a device keypair + registers. Tolerant.
  let deviceRegistration: import('./types.js').DeviceRegistration | undefined;
  if (deps.provisionDevice && deviceIdentity) {
    try {
      const r = await deps.provisionDevice({
        deviceIdentity,
        ...(idmBase ? { idmBase } : {}),
        ...(provisioningEndpoint ? { provisioningEndpoint } : {}),
      });
      if (r) {
        deviceRegistration = r;
        log('info', `device registered: instance=${r.deviceInstanceId ?? '?'} status=${r.status ?? '?'}${r.fromCache ? ' (cached)' : ''}`);
      }
    } catch (e) {
      log('warn', 'device registration failed — continuing', e);
    }
  }

  // 4. device token — best-effort against the real bank IDM. Tolerant.
  let deviceToken: string | null = null;
  if (deps.acquireDeviceToken) {
    try {
      const t = await deps.acquireDeviceToken({
        stage,
        ...(deviceIdentity ? { deviceIdentity } : {}),
        ...(idmBase ? { idmBase } : {}),
        ...(tokenEndpoint ? { tokenEndpoint } : {}),
      });
      deviceToken = typeof t === 'string' ? t : null;
      log('info', `device token acquired${deviceToken ? ` (${deviceToken.slice(0, 12)}…)` : ''}`);
    } catch (e) {
      log('warn', 'device token acquisition failed — continuing at device level', e);
    }
  }

  // 5. token level (device unless a user token is present).
  const tokenLevel: TokenLevel = deps.resolveTokenLevel ? await deps.resolveTokenLevel() : 'device';

  // 6. client-config record (kicked off in parallel above).
  const clientConfig = (await clientConfigPromise) as ClientConfig | undefined;
  if (!clientConfig) throw new Error(`[app-host] client-config record "${clientId}" not found`);

  // 7. navigation for this token level (sidebar + profile records).
  const navigation = await loadNavigation(deps, clientConfig, tokenLevel);
  log('info', `navigation loaded: homepage=${navigation.homepage}, tokenLevel=${tokenLevel} (sidebar ${navigation.sidebar.length}, profile ${navigation.profile.length})`);

  // 8. shell mode — declared per level in the client-config manifest.
  const shellMode = resolveShellMode(clientConfig, tokenLevel);

  return {
    clientId,
    stage,
    environment,
    clientConfig,
    navigation,
    tokenLevel,
    shellMode,
    ...(idmBase ? { idmBase } : {}),
    ...(deviceIdentity ? { deviceIdentity } : {}),
    ...(deviceRegistration ? { deviceRegistration } : {}),
    deviceToken,
  };
}
