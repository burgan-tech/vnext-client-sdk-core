# Header standard ↔ IDM gap (example for the IDM/platform team)

**Context:** the client was updated to emit the headers from
[`docs/http-headers-standard.md`](../http-headers-standard.md). Doing so broke the
`user-login` (2FA) flow. This note is the concrete example so the team can align
the running IDM with the standard.

## What the client changed

Modernized the request headers to the standard:

| Old (discrete) | New (standard) |
|----------------|----------------|
| `X-Device-Id: <id>` + `X-Installation-Id: <id>` | `X-Device: <deviceId>,<installationId>` |
| `user_reference: <subject|anonymous>` | `X-Actor: <userId>,<userRef>,<scopeId>,<scopeRef>,<consentId>` |
| `X-Request-Id: <uuid>` | `traceparent: 00-<traceId>-<spanId>-01` |
| `X-Device-Info` / `User-Agent` | `X-Client: <clientId>/<version> (<platform>)` |

## Symptom

- **device-manager (register) + token (device token): OK** with the new headers.
- **`user-login` (2FA): stalled** — after submitting credentials the flow never
  advanced to the second factor (no OTP/verify view). The whole login timed out.
- Restoring the discrete `X-Device-Id`, `X-Installation-Id`, `user_reference`
  (alongside the new standard headers) **fixed it immediately** (login green, ~31s).

## Root cause (confirmed in the IDM source)

The IDM `.csx` mappings still read the **discrete** headers. Grep of the IDM
workflow source (`*.csx`) for actual header reads:

```
16  x-actor            ← standard already partly adopted 👍
 3  user_reference     ← discrete (login/security flows)
 1  x-device-id        ← discrete
 1  x-installation-id  ← discrete
 1  x-forwarded-for
```

So `X-Actor` is already consumed in 16 places, but the `user-login` /
security-check path reads the **discrete** `user_reference` / `X-Device-Id` /
`X-Installation-Id` — which the standard replaces with combined `X-Device` +
`X-Actor`. When the client sent only the combined forms, that path couldn't
resolve the device/subject and didn't progress.

## Client-side interim fix (in place)

`standardHeaders()` now emits **both**: the standard (`X-Device`, `X-Actor`,
`traceparent`, `X-Client`) **and**, transitionally, the discrete
`X-Device-Id` / `X-Installation-Id` / `user_reference`. Marked to be dropped once
the IDM adopts the standard.

## Ask to the IDM team

Migrate the flows that still read the discrete headers — at minimum the
`user-login` (2FA) / security-check path — to read the combined **`X-Device`**
(`{deviceId},{installationId}`) and **`X-Actor`** instead of
`X-Device-Id` / `X-Installation-Id` / `user_reference`. `X-Actor` is already read
in 16 places, so the convention is partly there; this is about making the login
path consistent so the client can drop the legacy trio.

> Reproduce: point a client that sends only the standard headers at `user-login`
> and observe it stall past the credentials step; add back the discrete three to
> recover.
