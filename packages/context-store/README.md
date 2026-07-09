# @burgantech/context-store

Centralized, boundary-based state management SDK for web applications. Framework-agnostic — works with Angular, React, Vue, or plain TypeScript.

## Features

- **Boundary isolation** — `device`, `user`, and `subject` scopes keep data cleanly separated
- **Multiple storage backends** — `secureStorage`, `secureStorageEncrypted`, `memory`, `localStorage`
- **Envelope metadata** — every entry is wrapped with `createdAt`, `updatedAt`, `expiry`, `appName`, `appVersion`, `sdkVersion`
- **TTL & auto-expiry** — time-to-live with lazy cleanup on read and proactive `cleanup()` sweeps
- **Server time sync** — pluggable HTTP delegate fetches authoritative time; falls back to device time on failure
- **Encryption** — AES-256-GCM spec; encryption key held in memory only, never persisted
- **Observability** — `observeData` (Observable) and `addListener` / `removeListener` (callback) — no framework dependency
- **Nested access** — `dataPath` option for deep property read/write (e.g. `profile.address.city`)
- **Batch operations** — `batchSet`, `batchGet` for bulk reads and writes
- **Export / Import** — `exportData` and `importData` for migration and backup
- **Zero dependencies**

## Installation

```bash
npm install @burgantech/context-store
```

## Quick Start

```typescript
import { ContextStore, Boundary, Storage } from '@burgantech/context-store';

const store = ContextStore.create({
  timeServerUrls: ['https://your-api.com/time'],
  onRequestServerTime: async (url, timeout) => {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeout) });
    const d = res.headers.get('date');
    return d ? new Date(d) : null;
  },
  onLog: (level, message) => console.log(`[${level}] ${message}`),
});

// Identity
store.activeUser = 'user-42';
store.activeSubject = 'customer-7';

// Write
store.setData(Boundary.user, 'profile', { name: 'Ada', role: 'admin' });

// Read
const profile = store.getData(Boundary.user, 'profile');

// Nested access
store.setData(Boundary.user, 'profile', 'Lovelace', { dataPath: 'surname' });
const surname = store.getData(Boundary.user, 'profile', { dataPath: 'surname' });

// TTL (expires in 5 minutes)
store.setData(Boundary.user, 'otp', '123456', { ttl: 5 * 60_000 });

// Observe changes
const sub = store.observeData(Boundary.user, 'profile').subscribe((value) => {
  console.log('profile changed:', value);
});
// later: sub.unsubscribe();

// Listener
store.addListener('my-listener', Boundary.user, 'profile', (value) => {
  console.log('listener fired:', value);
});
store.removeListener('my-listener');
```

## Encryption

The SDK accepts an encryption key at runtime for `secureStorageEncrypted` storage. The key is held in memory only and never written to disk.

```typescript
// After authenticating, set the key provided by your backend
store.setEncryptionKey('backend-provided-key');

// Write encrypted
store.setData(Boundary.user, 'secret', { pin: '1234' }, { storage: Storage.secureStorageEncrypted });

// Read encrypted
const secret = store.getData(Boundary.user, 'secret', { storage: Storage.secureStorageEncrypted });

// On logout
store.revokeEncryptionKey();
```

## Server Time

The SDK never trusts device time for TTL calculations. It fetches authoritative time via a delegate you provide and caches the result.

```typescript
const serverTime = await store.getServerTime();
```

| Option | Default | Description |
|--------|---------|-------------|
| `timeServerUrls` | — | URL list for HEAD requests |
| `onRequestServerTime` | — | Async delegate: `(url, timeout) => Promise<Date \| null>` |
| `serverTimeTtl` | 1 800 000 (30 min) | Cache duration in ms |
| `requestServerTimeTimeout` | 5 000 | Per-request timeout in ms |

If all fetches fail, the SDK falls back to device time and reports the error via `onLog`.

## API Overview

### Identity

| Property / Method | Type | Description |
|---|---|---|
| `activeDevice` | `string \| null` | Read-only. SDK-generated per session (web) or from platform API (native). |
| `activeUser` | `string \| null` | Get/set. Application-managed user identity. |
| `activeSubject` | `string \| null` | Get/set. Sub-user scope (customer, tenant, etc.). |
| `getServerTime()` | `Promise<Date>` | Authoritative time; re-fetches when cache expires. |

### Data Operations

| Method | Description |
|---|---|
| `setData(boundary, key, value, options?)` | Write data. Options: `storage`, `ttl`, `dataPath`. |
| `getData<T>(boundary, key, options?)` | Read data. Returns `undefined` if missing or expired. |
| `getDataMetadata(boundary, key, options?)` | Read full envelope (metadata + data). |
| `deleteData(boundary, key, options?)` | Delete a key. Supports `dataPath` for nested removal. |
| `batchSet(operations)` | Bulk write. |
| `batchGet(operations)` | Bulk read. |

### Observability

| Method | Description |
|---|---|
| `observeData(boundary, key, options?)` | Returns `Observable<T>`. Emits on every `setData` for that key. |
| `addListener(id, boundary, key, callback, options?)` | Register a named callback. |
| `removeListener(id)` | Remove a named callback. |
| `clearAllListeners()` | Remove all callbacks. |

### Housekeeping

| Method | Description |
|---|---|
| `findKeys(boundary, partialKey, options?)` | Search keys by prefix. |
| `clearData(boundary, options?)` | Clear data for a boundary. Optional `partialKey` filter. |
| `exportData(boundary, options?)` | Export raw envelopes as a record. |
| `importData(boundary, data, options?)` | Import envelopes. `overwrite` flag controls conflict resolution. |
| `cleanup(options?)` | Remove expired entries. Filterable by `boundary` and `storage`. |

### Encryption Key

| Method | Description |
|---|---|
| `setEncryptionKey(key)` | Set the encryption key (in-memory only). |
| `isEncryptionKeySet` | `boolean` — whether a key is currently loaded. |
| `revokeEncryptionKey()` | Clear the key from memory. |

## Enums

```typescript
enum Boundary {
  device = 'device',
  user   = 'user',
  subject = 'subject',
}

enum Storage {
  secureStorage          = 'secureStorage',
  secureStorageEncrypted = 'secureStorageEncrypted',
  memory                 = 'memory',
  localStorage           = 'localStorage',
}
```

## Types

```typescript
type Envelope = {
  data: any;
  expiry: string | null;
  createdAt: string;
  updatedAt: string;
  appName: string;
  appVersion: string;
  sdkVersion: string;
};

type Subscription = { unsubscribe(): void };
type Observable<T> = { subscribe(callback: (value: T) => void): Subscription };
```

## Error Behaviour

| Scenario | Behaviour |
|---|---|
| `secureStorageEncrypted` access without key | Returns `undefined`, logs warning |
| Invalid key or boundary | Returns `undefined` |
| Storage write failure | Logs error via `onLog` |
| Server time fetch failure | Falls back to device time, logs error |
| Decryption with wrong key | Returns `undefined`, logs error |

## Requirements

- TypeScript ≥ 5.4
- ES2022 target (uses `crypto.randomUUID`, `structuredClone`)

## License

UNLICENSED — proprietary software.
