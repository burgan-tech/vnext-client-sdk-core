// ─────────────────────────────────────────────────────────────────────────
// Post-login token retrieval (2FA).
//
// After `user-login` reaches login-success it spawns a `token` subflow (grant
// authorization_code) waiting for PKCE redeem. This finds that subflow, redeems
// it with the codeVerifier, reads the issued tokens, and stores them in
// context-store under the user boundary.
// ─────────────────────────────────────────────────────────────────────────
import { contextStore } from '../sdk/context';
import { idmFetch } from './idmWorkflow';
import { reinitMorphClient, getLoginAuthId, setMorphTokens, getInteractiveLoginWorkflow } from './morphClient';

/**
 * Decode a JWT into the two identities the IDM always carries after login:
 *   • subject = the customer (müşteri) the operation is performed for = "scope"  → `sub`
 *   • actor   = the user acting on the customer's behalf                          → `act_sub`
 * For an individual (bireysel) customer the token has no `act_sub` and the two
 * coincide, so actor falls back to `sub`.
 */
function jwtIdentities(token: string): { subject: string | null; actor: string | null } {
  try {
    const part = token.split('.')[1];
    if (!part) return { subject: null, actor: null };
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { sub?: string; act_sub?: string };
    return { subject: claims.sub ?? null, actor: claims.act_sub ?? claims.sub ?? null };
  } catch {
    return { subject: null, actor: null };
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
  // The login workflow (domain + name) is config-driven (morphConfig interactive
  // context), not hardcoded. The token subflow name comes from the correlation.
  const lw = getInteractiveLoginWorkflow() ?? { domain: 'morph-idm', workflow: 'user-login' };
  const wfPath = (workflow: string) => `/${lw.domain}/workflows/${workflow}/instances`;

  // 1. Find the token subflow instance from the login instance state.
  const state = await idmFetch<{ activeCorrelations?: Correlation[] }>(
    `${wfPath(lw.workflow)}/${loginInstanceId}/functions/state`,
    { query: { sync: 'true' } },
  );
  const corrs = state.data?.activeCorrelations ?? [];
  const tokenCorr = corrs.find((c) => c.subFlowName === 'token') ?? corrs[0];
  const tokenInstanceId = tokenCorr?.subFlowInstanceId;
  const tokenWf = tokenCorr?.subFlowName ?? 'token';
  if (!tokenInstanceId) {
    console.warn('[login] no token subflow found on login instance', loginInstanceId);
    return null;
  }

  // 2. Redeem the token subflow with the PKCE codeVerifier (lenient: some flows
  //    auto-issue without a redeem, so we still read data even if this fails).
  const redeem = await idmFetch(
    `${wfPath(tokenWf)}/${tokenInstanceId}/transitions/redeem`,
    { method: 'PATCH', query: { sync: 'true' }, body: { attributes: { codeVerifier } } },
  );
  if (!redeem.ok) console.warn('[login] token redeem non-ok', redeem.status, JSON.stringify(redeem.data).slice(0, 160));

  // 3. Read the issued tokens.
  const data = await idmFetch(
    `${wfPath(tokenWf)}/${tokenInstanceId}/functions/data`,
    { query: { sync: 'true' } },
  );
  const tokens = findTokens(redeem.data) ?? findTokens(data.data);
  if (!tokens) {
    console.warn('[login] no tokens found (redeem status', redeem.status + ')');
    return null;
  }

  // 4. Establish BOTH identities (subject=customer, actor=user) in context, then
  //    hand the tokens to the generic auth client. Re-init first so the actor-scoped
  //    storage keys (morph `$subject` var, fed from activeUser) resolve, then
  //    setTokens under the config's login auth id (rootCallbackAuthId). The re-boot
  //    that follows re-reads these persisted tokens → tokenLevel = 2fa.
  const { subject, actor } = jwtIdentities(tokens.accessToken);
  contextStore.activeSubject = subject; // müşteri / scope
  contextStore.activeUser = actor ?? 'user'; // acting user (individual: same as subject)
  reinitMorphClient();
  const authId = getLoginAuthId();
  if (authId) {
    await setMorphTokens(authId, {
      accessToken: tokens.accessToken,
      ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    });
  }
  console.info(`%c[login] ✅ tokens acquired for ${authId} (access ${tokens.accessToken.slice(0, 12)}…)`, 'color:#2a9d3f;font-weight:bold');
  return tokens;
}
