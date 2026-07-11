// ─────────────────────────────────────────────────────────────────────────
// app-host domain model — the shapes discovered from the backend `shell` domain.
// Kept intentionally loose (index signatures) so the backend can evolve without
// breaking the client; app-host only reads the fields it needs for booting.
// ─────────────────────────────────────────────────────────────────────────

import type { DeviceIdentity } from './identity.js';

/** The three user auth states. Drives which navigation variant is shown. */
export type TokenLevel = 'device' | '1fa' | '2fa';

/** Result of registering the device with the IDM (device-manager flow). */
export interface DeviceRegistration {
  /** device-manager workflow instance id. */
  deviceManagerInstanceId?: string;
  /** Underlying device fact instance id (deviceData.instanceId). */
  deviceInstanceId?: string;
  /** Workflow status returned by the backend (e.g. "B"). */
  status?: string;
  /** The device certificate public key (PEM) used as the device's root identity. */
  publicKeyPem?: string;
  /** ISO timestamp when this registration was performed (set by the adapter). */
  registeredAt?: string;
  /** True when served from a local marker instead of a fresh backend call. */
  fromCache?: boolean;
}

/** A descriptor for a backend function endpoint (domain- or instance-scoped). */
export interface FunctionEndpoint {
  type?: string;
  runtime?: string;
  domain: string;
  workflow?: string;
  key?: string;
  function: string;
  body?: Record<string, unknown>;
  requiredToken?: Array<{ provider: string; token: string }>;
  [k: string]: unknown;
}

export interface AuthProvider {
  key: string;
  type: string;
  grantFlow?: FunctionEndpoint;
  tokenTypes?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EnvironmentStage {
  key: string;
  title?: string;
  baseUrl?: string;
  configEndpoint?: FunctionEndpoint;
  authProviders?: AuthProvider[];
  [k: string]: unknown;
}

export interface EnvironmentResponse {
  multiStageMode?: string;
  defaultStage?: string;
  stages: EnvironmentStage[];
}

export interface ClientConfig {
  theme?: Record<string, unknown>;
  api?: Record<string, unknown>;
  router?: { defaultMode?: string; allowChangeMode?: boolean; [k: string]: unknown };
  navigation?: { endpoint?: FunctionEndpoint };
  initialization?: unknown[];
  [k: string]: unknown;
}

export interface NavItem {
  type: string; // group | divider | dynamicView | staticView | webView | workflow | search | instance
  version?: string;
  key?: string;
  order?: number;
  title?: string;
  subtitle?: string;
  iconUrn?: string;
  disabled?: boolean;
  badge?: { isNew?: boolean; isHot?: boolean; count?: boolean | number };
  config?: Record<string, unknown>;
  children?: NavItem[];
  [k: string]: unknown;
}

export interface NavigationResponse {
  /** Master layout (app chrome) ref for this token level — opaque, host-rendered. */
  masterLayout?: Record<string, unknown>;
  homepage: string;
  items: NavItem[];
}

/** Everything app-host resolves during a boot. */
export interface AppHostState {
  clientId: string;
  stage: EnvironmentStage;
  environment: EnvironmentResponse;
  clientConfig: ClientConfig;
  navigation: NavigationResponse;
  tokenLevel: TokenLevel;
  /** Effective shell router mode after the device/1FA SDI override. */
  shellMode: 'sdi' | 'mdi';
  /** Device identity resolved at startup (deviceId/installationId/...). */
  deviceIdentity?: DeviceIdentity;
  /** Device registration result (device-manager), if provisioning ran. */
  deviceRegistration?: DeviceRegistration;
  /** The pre-login (device) access token, if acquisition succeeded. */
  deviceToken?: string | null;
}

/** Injected transport — keeps app-host free of any HTTP/framework choice. */
export type FetchJson = (
  path: string,
  init?: { method?: string; query?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export interface AppHostConfig {
  /** The ONLY hardcoded value in the app. */
  clientId: string;
  /** Base path all shell-domain function calls are built on (e.g. "/shell" in dev, proxied to the backend). */
  shellBase: string;
  /** Key of the environment boot function. Defaults to "environment". */
  environmentFunction?: string;
}

export interface AppHostDeps {
  /** Transport used for shell-domain calls (already scoped to shellBase host). */
  fetchJson: FetchJson;
  /** Resolves the device identity (deviceId/installationId/...) at startup. */
  resolveIdentity?: () => DeviceIdentity;
  /**
   * Registers the device with the IDM (ensures a device keypair, calls the
   * device-manager flow, persists the result). Platform-specific (crypto lives
   * in the adapter). Tolerant: failure does not block boot.
   */
  provisionDevice?: (ctx: { deviceIdentity: DeviceIdentity }) => Promise<DeviceRegistration | void>;
  /**
   * Best-effort device-token acquisition against the real bank IDM. Tolerant:
   * if it throws/rejects, boot continues at "device" level (shell endpoints are open).
   * Receives the selected stage + resolved identity; returns the access token if any.
   */
  acquireDeviceToken?: (ctx: {
    stage: EnvironmentStage;
    deviceIdentity?: DeviceIdentity;
  }) => Promise<string | void>;
  /** Reads the current token level from wherever tokens live (default: always "device"). */
  resolveTokenLevel?: () => TokenLevel | Promise<TokenLevel>;
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: unknown) => void;
}
