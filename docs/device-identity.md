# Device Identity

How the client establishes and persists its device identity at startup, before
any user login. Owned by `@burgan-tech/app-host`; the web policy below is the
reference, with the mobile mapping noted for parity (Dart/Swift/React exports).

## Artifacts

| Artifact | What it is | Produced |
|----------|------------|----------|
| **deviceId** | Stable identifier of the device/browser | Generated once, then reused |
| **installationId** | Identifier of one app install / browser-open | New per install (mobile) / per browser-open (web) |
| **device keypair** | RSA-2048 keypair; its public key (PEM) is the device certificate — the cryptographic root identity | Generated once, persisted |
| **device token** | Pre-login access token (`client_credentials`) bound to the device via `customClaims` | Fetched every boot |

## Storage tiers & lifetimes (web)

We use the **Web Storage API** (localStorage / sessionStorage) via `context-store`.
**No cookies** — device/installation identifiers never travel automatically on
every HTTP request; the client sends them deliberately (device-token
`customClaims`, and the `X-Device-Id` / `X-Installation-Id` headers on device
registration).

| Value | Storage tier | Refresh (F5) | New tab / window | Browser close→open |
|-------|--------------|:---:|:---:|:---:|
| **deviceId** | `localStorage` | ✅ kept | ✅ kept | ✅ kept |
| **installationId** | `sessionStorage` | ✅ kept | 🔄 new | 🔄 new |
| **device keypair (PEM)** | `localStorage` | ✅ kept | ✅ kept | ✅ kept |
| **device token** | `context-store` (memory) | 🔄 new | 🔄 new | 🔄 new |

Notes:
- `localStorage` is origin-scoped and survives indefinitely — so `deviceId` and
  the device keypair are stable across refreshes, tabs, and browser restarts.
- `sessionStorage` survives a **refresh** but is per-tab and cleared on tab close —
  so `installationId` changes on a new tab/window or a fresh browser open, **not**
  on refresh. (A refresh is not "opening the browser".)
- Identity resets only when site data is cleared, or in a different
  browser/profile, an incognito window, or a different origin. So "stable" means
  **per browser-profile + origin**.

### Mobile mapping (parity)

The core logic is platform-agnostic; only the storage adapter differs:

| Web tier | Mobile equivalent |
|----------|-------------------|
| `localStorage` (persistent) | secure device storage / Keychain / Keystore |
| `sessionStorage` (session) | install-scoped storage (new per install) |

On mobile: `deviceId` comes from the device, `installationId` is set at install
time; the keypair lives in the platform keystore (ideally non-extractable).

## How it works

`resolveDeviceIdentity` uses a **get-or-create** policy against an injected
`IdentityStore`:

```
deviceId = store.getPersistent('vnext.device.id')          // localStorage
if (!deviceId) { deviceId = newId(); store.setPersistent(...) }   // generate once

installationId = store.getSession('vnext.installation.id') // sessionStorage
if (!installationId) { installationId = newId(); store.setSession(...) }
```

The device keypair follows the same get-or-create policy; a stable public key
makes device registration naturally idempotent (the IDM keys the device fact by
the certificate).

## Boot order

```
clientId (only hardcoded value)
  → resolve device identity (deviceId, installationId, deviceInfo, appVersion)
  → ensure device keypair (generate + persist public/private PEM)
  → register device            (IDM device-manager; X-Device-Id / X-Installation-Id headers)
  → acquire device token        (client_credentials; deviceId/installationId as customClaims)
```

Device registration and device-token acquisition are **tolerant** and wrapped in
a timeout, so a slow/unreachable IDM never blocks startup.

## Implementation

- Core policy (platform-agnostic): [`packages/app-host/src/identity.ts`](../packages/app-host/src/identity.ts)
- Web adapter (localStorage/sessionStorage, `crypto.randomUUID`, `navigator` deviceInfo): [`examples/vue-app/src/boot/appHost.ts`](../examples/vue-app/src/boot/appHost.ts)
- Device keypair (WebCrypto RSA-2048 → PEM, persisted): [`examples/vue-app/src/boot/deviceCrypto.ts`](../examples/vue-app/src/boot/deviceCrypto.ts)
- Storage wrapper: [`examples/vue-app/src/sdk/context.ts`](../examples/vue-app/src/sdk/context.ts) (context-store)

Storage keys: `vnext.device.id`, `vnext.installation.id`, `device.cert.publicKeyPem`,
`device.cert.privateKeyPem`, `device.registration`.
