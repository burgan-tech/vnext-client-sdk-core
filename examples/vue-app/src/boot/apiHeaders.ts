// ─────────────────────────────────────────────────────────────────────────
// Standard request headers (docs/http-headers-standard.md), built once here and
// attached by every API client call. Interpreted for the browser:
//   • traceparent (W3C Trace Context) replaces X-Request-Id
//   • X-Device: {deviceId},{installationId}  (combined, per standard)
//   • X-Actor:  {userId},{userRef},{scopeId},{scopeRef},{consentId}  (post-login)
//   • User-Agent is a forbidden header in browser fetch, so the app identity
//     (clientId/version/platform) is sent as X-Client instead.
// Ambient values are read from the shared bus (context-store).
// ─────────────────────────────────────────────────────────────────────────
import { Boundary, Storage, contextStore, getContextValue } from '../sdk/context';
import { CLIENT_ID, APP_VERSION, CTX } from './constants';

const AMBIENT = { boundary: Boundary.device, storage: Storage.memory } as const;

function hex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** W3C Trace Context: version-traceId-spanId-flags. */
function traceparent(): string {
  return `00-${hex(16)}-${hex(8)}-01`;
}

/** Coarse "OS; Browser" for the app-identity header. */
function platform(): string {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android'
    : /(iPhone|iPad|iPod)/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Web';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os}; ${br}`;
}

/** The standard headers every API call carries. */
export function standardHeaders(): Record<string, string> {
  const deviceId = getContextValue<string>(CTX.deviceId, AMBIENT) ?? '';
  const installationId = getContextValue<string>(CTX.installationId, AMBIENT) ?? '';
  const clientId = getContextValue<string>(CTX.clientId, AMBIENT) ?? CLIENT_ID;
  const subject = contextStore.activeUser;
  const headers: Record<string, string> = {
    'Accept-Language': getContextValue<string>(CTX.locale, AMBIENT) ?? 'en',
    traceparent: traceparent(),
    'X-Device': `${deviceId},${installationId}`,
    'X-Client': `${clientId}/${APP_VERSION} (${platform()})`,
    // Transitional: the running IDM still reads these discrete headers (the
    // combined X-Device / X-Actor above are the target). Drop once IDM adopts
    // the standard — see docs/http-headers-standard.md.
    'X-Device-Id': deviceId,
    'X-Installation-Id': installationId,
    user_reference: subject ?? 'anonymous',
  };
  // X-Actor once a subject is known (post-login). Scope/consent unknown here.
  if (subject) headers['X-Actor'] = `${subject},${subject},,,`;
  return headers;
}

/** X-Workflow: {runtime},{domain},{workflow},{version},{instance} — for workflow ops. */
export function workflowHeader(
  domain: string,
  workflow: string,
  version: string,
  instanceId?: string,
): Record<string, string> {
  return { 'X-Workflow': `1.0,${domain},${workflow},${version},${instanceId ?? ''}` };
}
