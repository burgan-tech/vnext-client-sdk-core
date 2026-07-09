// ─────────────────────────────────────────────────────────────────────────
// Discovery chain — the "new glue" that boots an app from a single clientId.
//
//   clientId → environment → (device token, best-effort) → client-config
//            → tokenLevel → navigation(tokenLevel)
//
// Every backend function response is wrapped under a single (camelCased) key,
// e.g. { "clientConfig": {...} }. `unwrap` returns that inner value regardless
// of the key name, so app-host is decoupled from the wrapping convention.
// ─────────────────────────────────────────────────────────────────────────
import type {
  AppHostConfig,
  AppHostDeps,
  AppHostState,
  ClientConfig,
  EnvironmentResponse,
  EnvironmentStage,
  NavigationResponse,
  TokenLevel,
} from './types.js';

/** Backend wraps `Data` under one top-level key; return that inner value. */
function unwrap(response: unknown): unknown {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const keys = Object.keys(response as Record<string, unknown>);
    if (keys.length === 1) return (response as Record<string, unknown>)[keys[0]!];
  }
  return response;
}

function pickStage(env: EnvironmentResponse): EnvironmentStage {
  const stage =
    (env.defaultStage && env.stages.find((s) => s.key === env.defaultStage)) || env.stages[0];
  if (!stage) throw new Error('[app-host] environment returned no stages');
  return stage;
}

export async function discover(config: AppHostConfig, deps: AppHostDeps): Promise<AppHostState> {
  const log = deps.log ?? (() => undefined);
  const { clientId } = config;
  const envFn = config.environmentFunction ?? 'environment';

  const callFn = async (fn: string, query: Record<string, string>): Promise<unknown> => {
    const raw = await deps.fetchJson(`/functions/${fn}`, {
      query: { ...query, clientId, sync: 'true' },
    });
    return unwrap(raw);
  };

  // 1. environment — the first and only pre-configured call.
  log('info', `discovering environment for clientId=${clientId}`);
  const environment = (await callFn(envFn, {})) as EnvironmentResponse;
  const stage = pickStage(environment);
  log('info', `stage selected: ${stage.key}`);

  // 2. device identity (deviceId/installationId/...) — resolved before any token.
  const deviceIdentity = deps.resolveIdentity?.();
  if (deviceIdentity) {
    log('info', `device identity: deviceId=${deviceIdentity.deviceId} installationId=${deviceIdentity.installationId}`);
  }

  // 3. device registration (device-manager) — ensures a device keypair + registers. Tolerant.
  let deviceRegistration: import('./types.js').DeviceRegistration | undefined;
  if (deps.provisionDevice && deviceIdentity) {
    try {
      const r = await deps.provisionDevice({ deviceIdentity });
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
      const t = await deps.acquireDeviceToken({ stage, ...(deviceIdentity ? { deviceIdentity } : {}) });
      deviceToken = typeof t === 'string' ? t : null;
      log('info', `device token acquired${deviceToken ? ` (${deviceToken.slice(0, 12)}…)` : ''}`);
    } catch (e) {
      log('warn', 'device token acquisition failed — continuing at device level', e);
    }
  }

  // 4. token level (device unless a user token is present).
  const tokenLevel: TokenLevel = deps.resolveTokenLevel ? await deps.resolveTokenLevel() : 'device';

  // 5. client-config.
  const configFn = stage.configEndpoint?.function ?? 'client-config';
  const clientConfig = (await callFn(configFn, {})) as ClientConfig;

  // 6. navigation for this token level.
  const navFn = clientConfig.navigation?.endpoint?.function ?? 'navigation';
  const navigation = (await callFn(navFn, { tokenLevel })) as NavigationResponse;
  log('info', `navigation loaded: homepage=${navigation.homepage}, tokenLevel=${tokenLevel}`);

  // 7. shell mode: device/1FA always SDI (override); 2FA honors client-config.
  const configured = (clientConfig.router?.defaultMode ?? 'sdi').toLowerCase();
  const shellMode: 'sdi' | 'mdi' =
    tokenLevel === '2fa' && configured === 'mdi' ? 'mdi' : 'sdi';

  return {
    clientId,
    stage,
    environment,
    clientConfig,
    navigation,
    tokenLevel,
    shellMode,
    ...(deviceIdentity ? { deviceIdentity } : {}),
    ...(deviceRegistration ? { deviceRegistration } : {}),
    deviceToken,
  };
}
