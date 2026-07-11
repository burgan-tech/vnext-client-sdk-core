// ─────────────────────────────────────────────────────────────────────────
// PKCE (RFC 7636) — generated client-side for the authorization_code login.
// codeChallenge is sent on the `login` transition; codeVerifier is kept and
// presented at the token subflow `redeem`.
// ─────────────────────────────────────────────────────────────────────────

export interface Pkce {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkce(): Promise<Pkce> {
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return { codeVerifier, codeChallenge: base64url(new Uint8Array(digest)), codeChallengeMethod: 'S256' };
}
