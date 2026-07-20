// ─────────────────────────────────────────────────────────────────────────
// Web context providers — the host-side implementations of app-host's generic
// ContextProvider contract. They seed the code-embedded ambient values (client
// identity, device identity, web device facts) into the context-store at boot so
// schema-driven flows read them back via `x-context-source` with no per-flow code.
//
// This is the WEB platform impl (navigator/screen). A native/Dart adapter would
// supply its own providers reporting the real OS/device; the SDK contract + runner
// (app-host) stay identical.
// ─────────────────────────────────────────────────────────────────────────
import type { ContextProvider, ContextWrite } from '@burgan-tech/app-host';
import { CTX } from './constants';
import { webDeviceInfo } from './platform';

// Ambient values live in the device boundary, session-scoped memory (same slot
// standardHeaders + afterEnvironment read from).
const DEVICE = 'device' as const;
const MEMORY = 'memory' as const;

/**
 * Seeds every code-embedded ambient value: client identity (clientId/version),
 * device identity (deviceId/installationId, from the resolved identity), and the
 * web device facts (os/model/screen/…). One provider, many slots.
 */
const webAmbientProvider: ContextProvider = {
  id: 'web.ambient',
  provides: [
    { boundary: DEVICE, key: CTX.clientId },
    { boundary: DEVICE, key: CTX.appVersion },
    { boundary: DEVICE, key: CTX.deviceId },
    { boundary: DEVICE, key: CTX.installationId },
    { boundary: DEVICE, key: CTX.osName },
    { boundary: DEVICE, key: CTX.osVersion },
    { boundary: DEVICE, key: CTX.deviceModel },
    { boundary: DEVICE, key: CTX.manufacturer },
    { boundary: DEVICE, key: CTX.screenResolution },
    { boundary: DEVICE, key: CTX.language },
    { boundary: DEVICE, key: CTX.timezone },
    { boundary: DEVICE, key: CTX.userAgent },
  ],
  // eslint-disable-next-line @typescript-eslint/require-await
  async provide(ctx) {
    const id = ctx.deviceIdentity;
    const info = webDeviceInfo();
    const w = (key: string, value: unknown): ContextWrite => ({ boundary: DEVICE, key, value, storage: MEMORY });
    return [
      w(CTX.clientId, ctx.clientId),
      w(CTX.appVersion, ctx.appVersion),
      w(CTX.deviceId, id?.deviceId),
      w(CTX.installationId, id?.installationId),
      w(CTX.osName, info.osName),
      w(CTX.osVersion, info.osVersion),
      w(CTX.deviceModel, info.deviceModel),
      w(CTX.manufacturer, info.manufacturer),
      w(CTX.screenResolution, info.screenResolution),
      w(CTX.language, info.language),
      w(CTX.timezone, info.timezone),
      w(CTX.userAgent, info.userAgent),
    ];
  },
};

/** The ordered registry the boot runner executes eagerly. */
export const webContextProviders: ContextProvider[] = [webAmbientProvider];
