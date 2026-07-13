# Client hardcoding audit

Inventory of everything the client currently **hardcodes or hand-wires** — values
and per-flow logic — with the mechanism that will remove each once the
[schema-driven binding convention](./schema-driven-source-binding.md) lands.

Legend for "removed by":
`source` = `x-context-source` · `target` = `x-context-target` · `init` =
`client-config.initialization[]` · `env` = environment/client-config record ·
**keep** = legitimately client-side.

---

## 0. The one intended constant

| Value | Where | Note |
|-------|-------|------|
| `CLIENT_ID = 'IbWeb'` | `boot/appHost.ts` | **keep** — the single bootstrap constant by design. Everything else should derive from it. |

## 1. Hardcoded values

### 1.1 IDM endpoint / domain (duplicated)
| Value | Where | Removed by |
|-------|-------|-----------|
| `'/api/v1'` (IDM base) | `appHost.ts` (×2: provisionDevice, acquireDeviceToken), `idmWorkflow.ts` | **env** — already on `stage.baseUrl` / `authProviders[].grantFlow.idmBase`; `acquireDeviceToken` reads it, the others hardcode it. |
| `'morph-idm'` (IDM domain) | `appHost.ts` (provisionDevice), `idmWorkflow.ts` (WF registration), `NavView.vue` (default) | **env** — should come from the provider/flow descriptor. |
| `'/shell'` (shell base) | `appHost.ts` | **keep** (dev proxy prefix) / build config. |
| `APP_VERSION = '0.1.0'` | `appHost.ts` | build-injected. |

### 1.2 Request headers (`idmWorkflow.ts` `deviceHeaders`)
| Value | Note / Removed by |
|-------|-------------------|
| `'Accept-Language': 'tr-TR'` | should follow the active **locale** (we now have it). |
| `'X-Device-Info': 'vnext-web/0.1'` | build/env. |
| `user_reference: 'anonymous'` | pre-login placeholder; post-login should be the subject. **source**/identity. |
| `X-Device-Id` / `X-Installation-Id` | read from storage keys (ok) but keys are hardcoded (see 1.4). |

### 1.3 Device-token claims (`appHost.ts` `acquireDeviceToken`)
| Value | Removed by |
|-------|-----------|
| `grantType: gf.grantType ?? 'client_credentials'` | **env** (fallback hardcoded). |
| `customClaims: { channel: 'web', deviceId, installationId }` | **source** — the biggest offender: channel/deviceId/installationId injected by hand. |

### 1.4 Context-store keys (the read/write locations)
All hardcoded string keys; these become the **contract** the schema `source`/`target`
reference (see registry in the proposal). Currently the client owns them:

| Key | Where | Removed by |
|-----|-------|-----------|
| `auth.token.morph-idm-device.access` | `appHost.ts` (fallback), `HostShell.vue` | target (write) / env declares it |
| `auth.token.morph-idm-2fa.access` / `.refresh` | `login.ts`, `HostShell.vue` | **target** |
| `auth.token.morph-idm-1fa.access` | `HostShell.vue` | target |
| `device.registration` | `appHost.ts` | **target** (`device.registration.{instance}`) |
| `device.cert.publicKeyPem` / `.privateKeyPem` | `deviceCrypto.ts` | target / keep (client crypto) |
| `device.id` / installation id | `identity.ts` (`DEVICE_ID_KEY`/`INSTALLATION_ID_KEY`) | **keep** (client identity) but expose as source refs |

## 2. Hardcoded per-flow wiring

### 2.1 Device registration — `provisionDevice` (`appHost.ts`), runs every boot
Builds the `device-manager` start body (deviceInfo, cert public key, appVersion) +
headers, reads `deviceData.instanceId` / `status` from the response, writes
`device.registration`. **Removed by:** `init` (an `initialization[]` entry) +
`source` (inputs) + `target` (outputs: instanceId, certificate).

### 2.2 Device token — `acquireDeviceToken` (`appHost.ts`), runs every boot
Reads the environment grantFlow, builds the start body with hardcoded `customClaims`,
extracts `access_token`, writes it. **Removed by:** `init` + `source` (claims) +
`target` (access_token).

### 2.3 2FA login / PKCE — `WorkflowRunner.vue` + `NavView.vue` + `pkce.ts` + `login.ts`
| Hand-wired piece | Detail | Removed by |
|------------------|--------|-----------|
| PKCE detection | `NavView`: `pkce = start.grantType === 'authorization_code'` | source/flow metadata |
| `codeChallenge` injection | `WorkflowRunner`: on the literal `login` transition | flow metadata (which transition, which field) |
| token subflow redeem | `login.ts completeLogin`: finds `subFlowName==='token'`, PATCH `redeem` with codeVerifier | flow-specific — candidate for a generic "token subflow" convention |
| `findTokens` deep-search | tolerant scan for `accessToken`/`access_token` | **target** (name the fields) |
| subject → `activeUser` | `login.ts jwtSubject` decodes JWT `sub`/`act_sub` | **keep** (client identity) — but should be a declared **target** (`identity`) |
| token persistence | writes 2fa access/refresh to hardcoded keys | **target** |
| 2FA flip | `NavView onWorkflowSuccess`: `setTokenLevel('2fa')` | derive tokenLevel from tokens landed via **target** (see 2.6) |

### 2.4 change-password — nav config + `WorkflowRunner.vue`
`keyFrom: "activeUser"` + `startFields` (interim). **Removed by:** `source`
(`userId` from identity; passwords stay user input) + flow-design (read userId from
payload, not instance key).

### 2.5 Logout — `HostShell.vue` `onLogout`
Clears the three hardcoded token keys + `activeUser`, reboots to device.
**Removed by:** a declared session-scope (the keys come from the same `target`
registry; clearing = wiping that scope).

### 2.6 Token level — **not derived from tokens** (gap)
`discovery` defaults `tokenLevel='device'`; it only changes via an explicit
`start('2fa')` after login (`APP_SET_TOKEN_LEVEL`). It does **not** inspect which
tokens exist. Once tokens land in context-store via `target`, `tokenLevel` should be
**derived** (device < 1fa < 2fa by which access token is present). **Removed by:**
target + a small derive rule.

### 2.7 Shell-mode override — `discovery`
`device`/`1fa` forced to SDI, `2fa` honors `client-config.router.defaultMode`.
Business rule baked in the client. **Removed by:** **env** (per-level in the level
manifest).

### 2.8 Command / URN conventions — `NavView.vue`
`urn:shell:navigate:<type>:<key>` parsing + `WorkflowRunner transitionKeyFrom`
(URN last segment). **keep** — these are client-side rendering conventions, not
per-flow wiring.

## 3. Already backend-driven (for contrast — the target state)

- environment / client-config / navigation → workflow instances by key.
- theme (default + tokens), masterLayout, homepage, nav records (per level).
- device-token grantFlow descriptor (idmBase/domain/workflow/grantType/clientId/secret).
- token storage key (partially — `authProviders[].tokenTypes[].storage.key`).

## 4. Per-flow summary (the three the team will annotate)

| Flow | `source` (reads) | `target` (writes) |
|------|------------------|-------------------|
| **device-register** | deviceInfo, deviceId, installationId, cert public key, appVersion | `device.registration.{instance}`, certificate, status |
| **device-token** | clientId, clientSecret, grantType, channel, deviceId, installationId | `auth.token.morph-idm-device.access` |
| **login (2FA)** | clientId, grantType, scopes (+ PKCE codeChallenge — special) | `auth.token.morph-idm-2fa.access` / `.refresh`, subject → identity |
| **change-password** | `userId` (identity); old/new/confirm = user input | — |

## 5. Net

The genuinely-hardcoded surface that the convention removes is small and
concentrated: **device-token `customClaims`, token/registration persistence, the
device-register + device-token boot path, and the change-password/login glue.** The
IDM base/domain duplication and shell-mode override are `env` cleanups independent of
the schema convention. Everything else (clientId, device crypto, identity decode,
URN parsing, locale) is legitimately client-side.
