// ─────────────────────────────────────────────────────────────────────────
// app-host domain model — the shapes discovered from the backend `shell` domain.
// Kept intentionally loose (index signatures) so the backend can evolve without
// breaking the client; app-host only reads the fields it needs for booting.
// ─────────────────────────────────────────────────────────────────────────

import type { DeviceIdentity } from './identity.js';

/** The three user auth states. Drives which navigation variant is shown. */
/**
 * A token level = a config-defined auth context key (e.g. "device", "1fa",
 * "2fa"). A plain string, NOT a closed union: the set of levels and their
 * privilege order are declared in backend config (morphConfig.tokenLevels /
 * contexts), never hardcoded in the client.
 */
export type TokenLevel = string;

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

/**
 * A backend grant-flow descriptor (how to acquire a token). The device-token
 * adapter reads its fields (domain/workflow/grantType/clientId/...).
 */
export interface GrantFlow {
  type?: string;
  runtime?: string;
  domain?: string;
  workflow?: string;
  function?: string;
  grantType?: string;
  clientId?: string;
  clientSecret?: string;
  idmBase?: string;
  requiredToken?: Array<{ provider: string; token: string }>;
  [k: string]: unknown;
}

export interface AuthProvider {
  key: string;
  type: string;
  grantFlow?: GrantFlow;
  tokenTypes?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EnvironmentStage {
  key: string;
  title?: string;
  baseUrl?: string;
  authProviders?: AuthProvider[];
  [k: string]: unknown;
}

/** A named API host (morph-api-client `hosts[]` shape): base URL + allowed auth. */
export interface HostConfig {
  key: string;
  baseUrl: string;
  headers?: Record<string, string>;
  allowedAuth?: string[];
  [k: string]: unknown;
}

/** morph-api-client config carried in the environment record (providers/contexts). */
export interface MorphConfigBlob {
  rootCallbackAuthId?: string;
  providers?: Array<{
    key: string;
    contexts?: Array<{
      key: string;
      token?: { endpoint?: string; grantType?: string };
      provisioning?: { endpoint?: string };
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export interface EnvironmentResponse {
  multiStageMode?: string;
  defaultStage?: string;
  stages: EnvironmentStage[];
  /** Named API hosts (idm, shell, …) — the config home for base URLs. */
  hosts?: HostConfig[];
  /** morph-api-client config (MorphConfig shape) — providers/contexts. */
  morphConfig?: MorphConfigBlob;
}

/** Reference to a config record held as a workflow instance (fetched by key). */
export interface RecordRef {
  key: string;
  domain?: string;
  workflow?: string;
  version?: string;
  flow?: string;
  [k: string]: unknown;
}

/** Per-token-level manifest: which master chrome, homepage, nav records, shell mode. */
export interface LevelConfig {
  /** Master layout (app chrome) ref — opaque, host-rendered. */
  masterLayout?: RecordRef;
  homepage: string;
  /** Shell mode for this level (sdi/mdi). Backend-declared, not a client rule. */
  shellMode?: 'sdi' | 'mdi';
  nav: {
    /** Sidebar navigation record ref (instance of the `navigation` workflow). */
    sidebar: RecordRef;
    /** Profile-dropdown navigation record ref. */
    profile: RecordRef;
  };
}

export interface ClientConfig {
  theme?: Record<string, unknown>;
  /** Supported UI locales for the language switch. */
  i18n?: { default?: string; locales?: Array<{ code: string; label: string }> };
  api?: Record<string, unknown>;
  router?: { defaultMode?: string; allowChangeMode?: boolean; [k: string]: unknown };
  /** Per-token-level chrome + navigation manifest. */
  levels?: Record<string, LevelConfig>;
  initialization?: unknown[];
  [k: string]: unknown;
}

/** One localized label entry — mirrors the core definition convention. */
export interface LabelEntry {
  language: string; // e.g. "tr-TR", "en-US"
  label: string;
}
/**
 * Localizable text: the array-of-{language,label} form is preferred (open to new
 * languages); a plain string or a { <lang>: text } map are also accepted so older
 * records keep working. The host resolves it against the active locale.
 */
export type LocalizedText = string | LabelEntry[] | Record<string, string>;

export interface NavItem {
  type: string; // group | divider | dynamicView | staticView | webView | workflow | search | instance
  version?: string;
  key?: string;
  order?: number;
  title?: LocalizedText;
  subtitle?: LocalizedText;
  iconUrn?: string;
  disabled?: boolean;
  badge?: { isNew?: boolean; isHot?: boolean; count?: boolean | number };
  config?: Record<string, unknown>;
  children?: NavItem[];
  [k: string]: unknown;
}

/**
 * Resolved navigation for a token level: the master chrome + homepage (from the
 * level manifest) plus the two navigation records (sidebar + profile), each a
 * `navigation`-workflow instance fetched by key.
 */
export interface NavigationResponse {
  /** Master layout (app chrome) ref for this token level — opaque, host-rendered. */
  masterLayout?: Record<string, unknown>;
  homepage: string;
  /** Sidebar navigation items. */
  sidebar: NavItem[];
  /** Profile-dropdown navigation items. */
  profile: NavItem[];
}

/** Everything app-host resolves during a boot. */
export interface AppHostState {
  clientId: string;
  stage: EnvironmentStage;
  environment: EnvironmentResponse;
  clientConfig: ClientConfig;
  navigation: NavigationResponse;
  tokenLevel: TokenLevel;
  /** Effective shell router mode for this level (from the level manifest). */
  shellMode: 'sdi' | 'mdi';
  /** Resolved IDM host base URL (from environment `hosts`), for IDM API clients. */
  idmBase?: string;
  /** Device identity resolved at startup (deviceId/installationId/...). */
  deviceIdentity?: DeviceIdentity;
  /** Device registration result (device-manager), if provisioning ran. */
  deviceRegistration?: DeviceRegistration;
}

/** Injected transport — keeps app-host free of any HTTP/framework choice. */
export type FetchJson = (
  path: string,
  init?: { method?: string; query?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export interface AppHostConfig {
  /** The ONLY hardcoded value in the app. It is the instance key of the
   * `environment` and `client-config` config records. */
  clientId: string;
  /** Base path all shell-domain calls are built on (e.g. "/shell" in dev, proxied to the backend). */
  shellBase: string;
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
  provisionDevice?: (ctx: {
    deviceIdentity: DeviceIdentity;
    /** IDM host base resolved from environment `hosts` (config), not hardcoded. */
    idmBase?: string;
    /** Device-registration endpoint from the device context config (no client-side path building). */
    provisioningEndpoint?: string;
  }) => Promise<DeviceRegistration | void>;
  /**
   * Runs after the environment is fetched, BEFORE token-level resolution. The
   * adapter initializes the generic auth client (MorphClient) from the config and
   * acquires the pre-login device token, so `resolveTokenLevel` can read an
   * authoritative token status. Tolerant: failure does not block boot.
   */
  afterEnvironment?: (ctx: {
    environment: EnvironmentResponse;
    stage: EnvironmentStage;
    idmBase?: string;
    deviceIdentity?: DeviceIdentity;
    /** Device-token endpoint from the device context config. */
    tokenEndpoint?: string;
  }) => Promise<void>;
  /** Reads the current token level from wherever tokens live (default: always "device"). */
  resolveTokenLevel?: () => TokenLevel | Promise<TokenLevel>;
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: unknown) => void;
}
