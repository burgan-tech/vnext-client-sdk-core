// ─────────────────────────────────────────────────────────────────────────
// Bootstrap constants + the canonical context-store keys for ambient values.
//
// Ambient values (clientId, app version, device/installation id, locale, idmBase)
// are written to context-store ONCE at init and read from there by everyone —
// context-store is the shared bus every layer already knows. This is also the
// contract the backend `x-context-source` annotations will reference (see
// docs/proposals/schema-driven-source-binding.md).
// ─────────────────────────────────────────────────────────────────────────

/** The single bootstrap constant. */
export const CLIENT_ID = 'IbWeb';
/** App version (build-time constant; later injected by the build). */
export const APP_VERSION = '0.1.0';

// Bootstrap entry: how the client reaches the shell backend to fetch the
// environment record itself — so it CANNOT come from config (it's how we fetch
// config). The one base URL that stays a client constant (dev: Vite proxy prefix).
export const SHELL_BASE = '/shell';

// Canonical context-store keys for ambient values (device boundary). This is the
// shared vocabulary a backend schema's `x-context-source` references to read a
// value the client already holds — so the client wires nothing per-flow. Anything
// code-embedded and reusable is seeded here at boot by a context provider (see
// boot/contextProviders.ts); resolved-later facts (locale, idmBase) are written
// by their own boot steps.
export const CTX = {
  clientId: 'app.clientId',
  appVersion: 'app.version',
  locale: 'app.locale',
  /** IDM host base, resolved from the environment `hosts` config at boot. */
  idmBase: 'app.idmBase',
  deviceId: 'device.id',
  installationId: 'device.installation.id',
  // Device environment facts (platform-supplied) — seeded by a context provider,
  // the source values a schema-driven device-register flow reads via x-context-source.
  osName: 'device.osName',
  osVersion: 'device.osVersion',
  deviceModel: 'device.model',
  manufacturer: 'device.manufacturer',
  screenResolution: 'device.screenResolution',
  language: 'device.language',
  timezone: 'device.timezone',
  userAgent: 'device.userAgent',
} as const;
