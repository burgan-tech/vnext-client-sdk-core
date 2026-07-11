// ─────────────────────────────────────────────────────────────────────────
// Post-login token retrieval (2FA).
//
// After `user-login` reaches login-success it spawns a `token` subflow (grant
// authorization_code) waiting for PKCE redeem. This finds that subflow, redeems
// it with the codeVerifier, reads the issued tokens, and stores them in
// context-store under the user boundary.
// ─────────────────────────────────────────────────────────────────────────
import { Boundary, Storage, contextStore, setContextValue } from '../sdk/context';
import { idmFetch } from './idmWorkflow';

/** Decode a JWT payload's subject (sub, or act_sub for delegated tokens). */
function jwtSubject(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { sub?: string; act_sub?: string };
    return claims.sub || claims.act_sub || null;
  } catch {
    return null;
  }
}

export interface UserTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

interface Correlation {
  subFlowInstanceId?: string;
  subFlowName?: string;
  subFlowType?: string;
  parentState?: string;
}

/** Deep-find the first object that carries an `accessToken` (handles wrapping). */
function findTokens(node: unknown): UserTokens | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  if (typeof o['accessToken'] === 'string') return o as unknown as UserTokens;
  if (typeof o['access_token'] === 'string') {
    return {
      accessToken: o['access_token'] as string,
      idToken: o['id_token'] as string | undefined,
      refreshToken: o['refresh_token'] as string | undefined,
      expiresIn: o['expires_in'] as number | undefined,
      tokenType: o['token_type'] as string | undefined,
    };
  }
  for (const v of Object.values(o)) {
    const found = findTokens(v);
    if (found) return found;
  }
  return null;
}

export async function completeLogin(
  loginInstanceId: string,
  codeVerifier: string,
): Promise<UserTokens | null> {
  // 1. Find the token subflow instance from the login instance state.
  const state = await idmFetch<{ activeCorrelations?: Correlation[] }>(
    `/morph-idm/workflows/user-login/instances/${loginInstanceId}/functions/state`,
    { query: { sync: 'true' } },
  );
  const corrs = state.data?.activeCorrelations ?? [];
  const tokenCorr = corrs.find((c) => c.subFlowName === 'token') ?? corrs[0];
  const tokenInstanceId = tokenCorr?.subFlowInstanceId;
  if (!tokenInstanceId) {
    console.warn('[login] no token subflow found on login instance', loginInstanceId);
    return null;
  }

  // 2. Redeem the token subflow with the PKCE codeVerifier (lenient: some flows
  //    auto-issue without a redeem, so we still read data even if this fails).
  const redeem = await idmFetch(
    `/morph-idm/workflows/token/instances/${tokenInstanceId}/transitions/redeem`,
    { method: 'PATCH', query: { sync: 'true' }, body: { attributes: { codeVerifier } } },
  );
  if (!redeem.ok) console.warn('[login] token redeem non-ok', redeem.status, JSON.stringify(redeem.data).slice(0, 160));

  // 3. Read the issued tokens.
  const data = await idmFetch(
    `/morph-idm/workflows/token/instances/${tokenInstanceId}/functions/data`,
    { query: { sync: 'true' } },
  );
  const tokens = findTokens(redeem.data) ?? findTokens(data.data);
  if (!tokens) {
    console.warn('[login] no tokens found (redeem status', redeem.status + ')');
    return null;
  }

  // 4. Establish the user identity so the `user` boundary resolves a key prefix
  //    (context-store user/subject scoping needs activeUser set), then persist.
  contextStore.activeUser = jwtSubject(tokens.accessToken) ?? 'user';
  setContextValue('auth.token.morph-idm-2fa.access', tokens.accessToken, { boundary: Boundary.user, storage: Storage.memory });
  if (tokens.refreshToken) {
    setContextValue('auth.token.morph-idm-2fa.refresh', tokens.refreshToken, { boundary: Boundary.user, storage: Storage.localStorage });
  }
  console.info(`%c[login] ✅ 2FA tokens acquired (access ${tokens.accessToken.slice(0, 12)}…)`, 'color:#2a9d3f;font-weight:bold');
  return tokens;
}
