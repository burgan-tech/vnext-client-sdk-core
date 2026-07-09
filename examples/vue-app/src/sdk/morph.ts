// ─────────────────────────────────────────────────────────────────────────
// morph-api SDK — the HTTP/auth transport foundation.
//
// A single MorphClient is created here as a module singleton (the pattern the
// upstream POC uses). Auth uses a plain client_credentials grant (client_secret,
// non-interactive) so it can be fully mocked by MSW — no Keycloak/Docker needed.
// The token endpoint and the demo API are both served by the MSW handlers.
// ─────────────────────────────────────────────────────────────────────────
import { MorphClient, type MorphConfig, type MorphOptions } from '@morph/core';
import { oauth2Plugin } from '@morph/oauth2';
import { browserStoragePlugin } from '@morph/browser-storage';
import { loggerPlugin } from '@morph/logger';

// Base origin used by both the mock IdP and the mock API. MSW intercepts these
// in the browser before any real network call is made.
const ORIGIN = window.location.origin;

export const morphConfig: MorphConfig = {
  providers: [
    {
      key: 'demo-idp',
      type: 'oauth2',
      baseUrl: `${ORIGIN}/idp`,
      contexts: [
        {
          key: 'service',
          clientId: 'demo-service',
          clientSecret: 'demo-secret',
          // clientAuth omitted + clientSecret present => plain client_secret grant.
          token: { endpoint: '/token' },
          delegateMetadata: {
            workflow: 'service-auth',
            grantHint: 'client_credentials',
            interaction: 'non-interactive',
          },
          recoveryPolicy: { onUnauthorized: 'delegate', onRefreshFail: 'clear' },
          tokenTypes: {
            access: {
              header: { name: 'Authorization', scheme: 'Bearer' },
              expiryPolicy: 'token',
              storage: {
                scope: 'device',
                type: 'memory',
                protection: 'secure',
                key: 'service.access',
              },
            },
          },
        },
      ],
    },
  ],
  hosts: [
    {
      // Mocked demo API (MSW) — used by the Morph API screen.
      key: 'demo-api',
      baseUrl: `${ORIGIN}/api`,
      allowedAuth: ['demo-idp/service'],
    },
    {
      // Real morph-idm workflow backend, reached through the Vite dev proxy
      // (`/api/v1` → test-vnext-morph-idm). The API is public in test, but morph
      // still requires an auth context, so we attach the (mock) service token —
      // the backend ignores it.
      key: 'morph-idm-api',
      baseUrl: `${ORIGIN}/api/v1`,
      allowedAuth: ['demo-idp/service'],
    },
  ],
};

const logger = loggerPlugin({ level: 'info', prefix: '[morph] ' });

const options: MorphOptions = {
  plugins: [
    logger,
    oauth2Plugin({
      logger,
      storage: browserStoragePlugin({ prefix: 'vnext:tk:', logger }),
      autoAcquireNonInteractive: true,
    }),
  ],
  autoAcquireNonInteractive: true,
  onLog: (level, message, error, context) => {
    const style = level === 'error' || level === 'warn' ? 'color:#c0392b;font-weight:bold' : 'color:#a0a';
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug'](
      `%c[morph] ${level}: ${message}`, style, context ?? '', error ?? '',
    );
  },
  onHttpTrace: (e) => {
    // eslint-disable-next-line no-console
    console.debug(`%c[morph:http] ${e.kind} ${(e as { method?: string }).method ?? ''} ${(e as { url?: string }).url ?? (e as { path?: string }).path ?? ''} → ${(e as { status?: number }).status ?? ''}`, 'color:#7a7');
  },
};

export const morph = MorphClient.init(morphConfig, options);

/** The auth id used for non-interactive service-to-service calls in this demo. */
export const SERVICE_AUTH_ID = 'demo-idp/service';

/**
 * Acquire the (mock) client-credentials token up front. The SDK does NOT
 * auto-acquire on the very first request when no token exists yet — it only
 * re-acquires an EXPIRED client-credentials token — so we prime it here.
 * Must run AFTER MSW is started (the token endpoint is mocked).
 */
export async function ensureMorphAuth(): Promise<void> {
  try {
    await morph.auth(SERVICE_AUTH_ID).acquire();
    // eslint-disable-next-line no-console
    console.info('%c[morph] ✅ service token acquired', 'color:#2a9d3f;font-weight:bold');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[morph] ❌ token acquisition failed', e);
    throw e;
  }
}
