// ─────────────────────────────────────────────────────────────────────────
// MSW handlers — mock the network for the morph-api SDK (browser-intercepted,
// so there is no CORS and no real IdP/Keycloak needed).
//
//   POST */idp/token   → OAuth2 token endpoint (client_credentials)
//   GET  */api/accounts→ a protected resource requiring a Bearer token
//   GET  */api/profile → another protected resource
//
// The workflow-manager SDK does NOT go through MSW — it uses the in-memory
// WorkflowMockBackend delegate directly.
// ─────────────────────────────────────────────────────────────────────────
import { http, HttpResponse } from 'msw';

let tokenSeq = 0;

export const handlers = [
  // OAuth2 token endpoint — accepts any client_credentials request and mints a token.
  http.post('*/idp/token', async () => {
    tokenSeq += 1;
    return HttpResponse.json({
      access_token: `mock-access-token-${tokenSeq}`,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: `mock-refresh-token-${tokenSeq}`,
      scope: 'service',
    });
  }),

  // Protected resource — requires the Authorization header the SDK attaches.
  http.get('*/api/accounts', ({ request }) => {
    const auth = request.headers.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return HttpResponse.json({
      accounts: [
        { id: 'acc-1', iban: 'TR00 0001 0002 0003', currency: 'TRY', balance: 12500.5 },
        { id: 'acc-2', iban: 'TR00 0001 0002 0004', currency: 'USD', balance: 430.0 },
      ],
      _auth: auth,
    });
  }),

  http.get('*/api/profile', ({ request }) => {
    const auth = request.headers.get('authorization');
    if (!auth) return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
    return HttpResponse.json({ id: 'user-1', name: 'Demo User', roles: ['service'] });
  }),
];
