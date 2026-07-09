import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContextStore, Boundary, Storage } from '../src/index';
import type { ContextStoreOptions, LogLevel } from '../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTimeDelegate = vi.fn(async () => new Date());

function opts(overrides: Partial<ContextStoreOptions> = {}): ContextStoreOptions {
  return {
    timeServerUrls: ['https://time.example.com'],
    onRequestServerTime: mockTimeDelegate,
    appName: 'test-app',
    appVersion: '1.0.0',
    ...overrides,
  };
}

function createStore(overrides: Partial<ContextStoreOptions> = {}) {
  return ContextStore.create(opts(overrides));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockTimeDelegate.mockReset().mockResolvedValue(new Date());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================================================
// 1. Identity
// ===========================================================================

describe('Identity', () => {
  it('generates a deviceId on creation', () => {
    const store = createStore();
    expect(store.activeDevice).toBeTruthy();
    expect(store.activeDevice!.length).toBeGreaterThan(8);
  });

  it('deviceId persists within the same session (sessionStorage)', () => {
    const store1 = createStore();
    const store2 = createStore();
    expect(store1.activeDevice).toBe(store2.activeDevice);
  });

  it('activeUser get/set', () => {
    const store = createStore();
    expect(store.activeUser).toBeNull();
    store.activeUser = 'john';
    expect(store.activeUser).toBe('john');
    store.activeUser = null;
    expect(store.activeUser).toBeNull();
  });

  it('activeSubject get/set', () => {
    const store = createStore();
    expect(store.activeSubject).toBeNull();
    store.activeSubject = 'customer-42';
    expect(store.activeSubject).toBe('customer-42');
  });
});

// ===========================================================================
// 2. CRUD — setData / getData / deleteData
// ===========================================================================

describe('CRUD', () => {
  it('stores and retrieves a simple value', () => {
    const store = createStore();
    store.setData(Boundary.device, 'greeting', 'hello');
    expect(store.getData(Boundary.device, 'greeting')).toBe('hello');
  });

  it('stores and retrieves a JSON object', () => {
    const store = createStore();
    const obj = { name: 'Alice', age: 30, tags: ['admin'] };
    store.setData(Boundary.device, 'profile', obj);
    expect(store.getData(Boundary.device, 'profile')).toEqual(obj);
  });

  it('returns undefined for missing key', () => {
    const store = createStore();
    expect(store.getData(Boundary.device, 'nonexistent')).toBeUndefined();
  });

  it('stores to memory storage', () => {
    const store = createStore();
    store.setData(Boundary.device, 'mem-key', 'mem-val', { storage: Storage.memory });
    expect(store.getData(Boundary.device, 'mem-key', { storage: Storage.memory })).toBe('mem-val');
    // should NOT be in localStorage
    expect(store.getData(Boundary.device, 'mem-key', { storage: Storage.secureStorage })).toBeUndefined();
  });

  it('stores to localStorage storage', () => {
    const store = createStore();
    store.setData(Boundary.device, 'loc-key', 42, { storage: Storage.localStorage });
    expect(store.getData(Boundary.device, 'loc-key', { storage: Storage.localStorage })).toBe(42);
  });

  it('deleteData removes entry', () => {
    const store = createStore();
    store.setData(Boundary.device, 'temp', 'data');
    expect(store.getData(Boundary.device, 'temp')).toBe('data');
    store.deleteData(Boundary.device, 'temp');
    expect(store.getData(Boundary.device, 'temp')).toBeUndefined();
  });

  it('overwrites existing data on setData', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', 'v1');
    store.setData(Boundary.device, 'k', 'v2');
    expect(store.getData(Boundary.device, 'k')).toBe('v2');
  });
});

// ===========================================================================
// 3. DataPath — nested property access
// ===========================================================================

describe('DataPath', () => {
  it('sets a nested property via dataPath', () => {
    const store = createStore();
    store.setData(Boundary.device, 'config', { ui: { theme: 'light' }, lang: 'en' });
    store.setData(Boundary.device, 'config', 'dark', { dataPath: 'ui.theme' });
    expect(store.getData(Boundary.device, 'config')).toEqual({ ui: { theme: 'dark' }, lang: 'en' });
  });

  it('gets a nested property via dataPath', () => {
    const store = createStore();
    store.setData(Boundary.device, 'config', { ui: { theme: 'dark' }, lang: 'en' });
    expect(store.getData(Boundary.device, 'config', { dataPath: 'ui.theme' })).toBe('dark');
    expect(store.getData(Boundary.device, 'config', { dataPath: 'lang' })).toBe('en');
  });

  it('deletes a nested property via dataPath', () => {
    const store = createStore();
    store.setData(Boundary.device, 'config', { a: 1, b: 2 });
    store.deleteData(Boundary.device, 'config', { dataPath: 'a' });
    expect(store.getData(Boundary.device, 'config')).toEqual({ b: 2 });
  });

  it('returns undefined for missing nested path', () => {
    const store = createStore();
    store.setData(Boundary.device, 'config', { a: 1 });
    expect(store.getData(Boundary.device, 'config', { dataPath: 'x.y.z' })).toBeUndefined();
  });
});

// ===========================================================================
// 4. Boundary Isolation
// ===========================================================================

describe('Boundary Isolation', () => {
  it('device boundary does not require activeUser', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', 'v');
    expect(store.getData(Boundary.device, 'k')).toBe('v');
  });

  it('user boundary requires activeUser — returns undefined without it', () => {
    const store = createStore();
    store.setData(Boundary.user, 'k', 'v');
    expect(store.getData(Boundary.user, 'k')).toBeUndefined();
  });

  it('user boundary works when activeUser is set', () => {
    const store = createStore();
    store.activeUser = 'alice';
    store.setData(Boundary.user, 'k', 'v');
    expect(store.getData(Boundary.user, 'k')).toBe('v');
  });

  it('different users have isolated data', () => {
    const store = createStore();
    store.activeUser = 'alice';
    store.setData(Boundary.user, 'pref', 'dark');
    store.activeUser = 'bob';
    store.setData(Boundary.user, 'pref', 'light');

    store.activeUser = 'alice';
    expect(store.getData(Boundary.user, 'pref')).toBe('dark');
    store.activeUser = 'bob';
    expect(store.getData(Boundary.user, 'pref')).toBe('light');
  });

  it('subject boundary requires both activeUser and activeSubject', () => {
    const store = createStore();
    store.activeUser = 'alice';
    store.setData(Boundary.subject, 'k', 'v');
    expect(store.getData(Boundary.subject, 'k')).toBeUndefined();

    store.activeSubject = 'cust-1';
    store.setData(Boundary.subject, 'k', 'v');
    expect(store.getData(Boundary.subject, 'k')).toBe('v');
  });

  it('different subjects have isolated data', () => {
    const store = createStore();
    store.activeUser = 'alice';

    store.activeSubject = 'cust-1';
    store.setData(Boundary.subject, 'note', 'A');
    store.activeSubject = 'cust-2';
    store.setData(Boundary.subject, 'note', 'B');

    store.activeSubject = 'cust-1';
    expect(store.getData(Boundary.subject, 'note')).toBe('A');
    store.activeSubject = 'cust-2';
    expect(store.getData(Boundary.subject, 'note')).toBe('B');
  });

  it('device data is NOT visible from user scope', () => {
    const store = createStore();
    store.setData(Boundary.device, 'shared-key', 'device-val');
    store.activeUser = 'alice';
    expect(store.getData(Boundary.user, 'shared-key')).toBeUndefined();
  });
});

// ===========================================================================
// 5. Storage Isolation
// ===========================================================================

describe('Storage Isolation', () => {
  it('memory and secureStorage are separate namespaces', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', 'secure', { storage: Storage.secureStorage });
    store.setData(Boundary.device, 'k', 'mem', { storage: Storage.memory });

    expect(store.getData(Boundary.device, 'k', { storage: Storage.secureStorage })).toBe('secure');
    expect(store.getData(Boundary.device, 'k', { storage: Storage.memory })).toBe('mem');
  });

  it('memory storage does not persist to localStorage', () => {
    const store = createStore();
    store.setData(Boundary.device, 'ephemeral', 123, { storage: Storage.memory });
    expect(window.localStorage.length).toBe(0);
  });
});

// ===========================================================================
// 6. Envelope & Metadata
// ===========================================================================

describe('Envelope', () => {
  it('getDataMetadata returns full envelope', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', { foo: 'bar' });
    const env = store.getDataMetadata(Boundary.device, 'k');

    expect(env).toBeDefined();
    expect(env!.data).toEqual({ foo: 'bar' });
    expect(env!.createdAt).toBeTruthy();
    expect(env!.updatedAt).toBeTruthy();
    expect(env!.appName).toBe('test-app');
    expect(env!.appVersion).toBe('1.0.0');
    expect(env!.sdkVersion).toBe('0.1.0');
    expect(env!.expiry).toBeNull();
  });

  it('updatedAt changes on update, createdAt stays', () => {
    vi.useFakeTimers();
    const store = createStore();

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    store.setData(Boundary.device, 'k', 'v1');
    const env1 = store.getDataMetadata(Boundary.device, 'k')!;

    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    store.setData(Boundary.device, 'k', 'v2');
    const env2 = store.getDataMetadata(Boundary.device, 'k')!;

    expect(env2.createdAt).toBe(env1.createdAt);
    expect(env2.updatedAt).not.toBe(env1.updatedAt);
    expect(new Date(env2.updatedAt) > new Date(env1.updatedAt)).toBe(true);
  });

  it('getDataMetadata returns undefined for missing key', () => {
    const store = createStore();
    expect(store.getDataMetadata(Boundary.device, 'nope')).toBeUndefined();
  });

  it('envelope has expiry when TTL is set', () => {
    const store = createStore();
    store.setData(Boundary.device, 'temp', 'data', { ttl: 60000 });
    const env = store.getDataMetadata(Boundary.device, 'temp')!;
    expect(env.expiry).toBeTruthy();
  });
});

// ===========================================================================
// 7. TTL & Expiry
// ===========================================================================

describe('TTL & Expiry', () => {
  it('data without TTL never expires', () => {
    vi.useFakeTimers();
    const store = createStore();

    store.setData(Boundary.device, 'forever', 'alive');

    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); // 1 year
    expect(store.getData(Boundary.device, 'forever')).toBe('alive');
  });

  it('data with TTL returns undefined after expiry (lazy cleanup)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const store = createStore();

    store.setData(Boundary.device, 'short', 'temp', { ttl: 5000 });
    expect(store.getData(Boundary.device, 'short')).toBe('temp');

    vi.advanceTimersByTime(6000);
    expect(store.getData(Boundary.device, 'short')).toBeUndefined();
  });

  it('lazy cleanup removes the entry from storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const store = createStore();

    store.setData(Boundary.device, 'expire-me', 'x', { ttl: 1000 });
    vi.advanceTimersByTime(2000);
    store.getData(Boundary.device, 'expire-me'); // triggers cleanup

    // even getDataMetadata should be gone
    expect(store.getDataMetadata(Boundary.device, 'expire-me')).toBeUndefined();
  });

  it('proactive cleanup() removes all expired entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const store = createStore();

    store.setData(Boundary.device, 'a', '1', { ttl: 1000 });
    store.setData(Boundary.device, 'b', '2', { ttl: 1000 });
    store.setData(Boundary.device, 'c', '3'); // no TTL

    vi.advanceTimersByTime(2000);
    store.cleanup();

    expect(store.getData(Boundary.device, 'a')).toBeUndefined();
    expect(store.getData(Boundary.device, 'b')).toBeUndefined();
    expect(store.getData(Boundary.device, 'c')).toBe('3');
  });

  it('cleanup() with boundary filter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const store = createStore();
    store.activeUser = 'alice';

    store.setData(Boundary.device, 'dk', 'dv', { ttl: 1000 });
    store.setData(Boundary.user, 'uk', 'uv', { ttl: 1000 });

    vi.advanceTimersByTime(2000);
    store.cleanup({ boundary: Boundary.device });

    expect(store.getData(Boundary.device, 'dk')).toBeUndefined();
    // user entry was NOT cleaned because we filtered to device only
    // (it's still expired — lazy cleanup will catch it on next read)
    expect(store.getDataMetadata(Boundary.user, 'uk')).toBeDefined();
  });
});

// ===========================================================================
// 8. Encryption
// ===========================================================================

describe('Encryption', () => {
  it('isEncryptionKeySet reflects key state', () => {
    const store = createStore();
    expect(store.isEncryptionKeySet).toBe(false);
    store.setEncryptionKey('my-secret');
    expect(store.isEncryptionKeySet).toBe(true);
    store.revokeEncryptionKey();
    expect(store.isEncryptionKeySet).toBe(false);
  });

  it('stores and retrieves encrypted data with correct key', () => {
    const store = createStore();
    store.setEncryptionKey('secret-123');
    store.setData(Boundary.device, 'card', '4111-xxxx', { storage: Storage.secureStorageEncrypted });
    expect(store.getData(Boundary.device, 'card', { storage: Storage.secureStorageEncrypted })).toBe('4111-xxxx');
  });

  it('encrypted data in localStorage is not plaintext', () => {
    const store = createStore();
    store.setEncryptionKey('secret-123');
    store.setData(Boundary.device, 'card', '4111-xxxx', { storage: Storage.secureStorageEncrypted });

    // raw localStorage value should NOT contain the plaintext
    const allKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) allKeys.push(k);
    }
    const encKey = allKeys.find((k) => k.includes('secureStorageEncrypted'));
    expect(encKey).toBeDefined();
    const raw = window.localStorage.getItem(encKey!);
    expect(raw).toBeDefined();
    expect(raw).not.toContain('4111-xxxx');
  });

  it('returns undefined when encryption key is not set', () => {
    const logFn = vi.fn();
    const store = createStore({ onLog: logFn });
    // try to read encrypted storage without key
    expect(store.getData(Boundary.device, 'any', { storage: Storage.secureStorageEncrypted })).toBeUndefined();
  });

  it('fails to decrypt with wrong key', () => {
    const logFn = vi.fn();
    const store = createStore({ onLog: logFn });

    store.setEncryptionKey('correct-key');
    store.setData(Boundary.device, 'secret', 'top-secret', { storage: Storage.secureStorageEncrypted });

    store.setEncryptionKey('wrong-key');
    const result = store.getData(Boundary.device, 'secret', { storage: Storage.secureStorageEncrypted });
    expect(result).toBeUndefined();

    const errorLog = logFn.mock.calls.find(
      ([level]: [LogLevel]) => level === 'error',
    );
    expect(errorLog).toBeDefined();
    expect(errorLog![1]).toContain('Decryption failed');
  });

  it('revokeEncryptionKey blocks subsequent reads', () => {
    const store = createStore();
    store.setEncryptionKey('key');
    store.setData(Boundary.device, 'x', 'y', { storage: Storage.secureStorageEncrypted });
    store.revokeEncryptionKey();
    expect(store.getData(Boundary.device, 'x', { storage: Storage.secureStorageEncrypted })).toBeUndefined();
  });

  it('re-setting the correct key restores access', () => {
    const store = createStore();
    store.setEncryptionKey('key-abc');
    store.setData(Boundary.device, 'x', 'restored', { storage: Storage.secureStorageEncrypted });
    store.revokeEncryptionKey();
    expect(store.getData(Boundary.device, 'x', { storage: Storage.secureStorageEncrypted })).toBeUndefined();

    store.setEncryptionKey('key-abc');
    expect(store.getData(Boundary.device, 'x', { storage: Storage.secureStorageEncrypted })).toBe('restored');
  });

  it('encrypted JSON object round-trip', () => {
    const store = createStore();
    store.setEncryptionKey('json-key');
    const obj = { nested: { arr: [1, 2, 3], flag: true } };
    store.setData(Boundary.device, 'obj', obj, { storage: Storage.secureStorageEncrypted });
    expect(store.getData(Boundary.device, 'obj', { storage: Storage.secureStorageEncrypted })).toEqual(obj);
  });
});

// ===========================================================================
// 9. PEM / DER Detection
// ===========================================================================

describe('PEM/DER', () => {
  const PEM_CERT = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
-----END CERTIFICATE-----`;

  it('PEM data is stored raw (no envelope)', () => {
    const store = createStore();
    store.setData(Boundary.device, 'cert', PEM_CERT);
    expect(store.getData(Boundary.device, 'cert')).toBe(PEM_CERT);
    // no envelope metadata
    expect(store.getDataMetadata(Boundary.device, 'cert')).toBeFalsy();
  });

  it('PEM data is not subject to TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const store = createStore();

    store.setData(Boundary.device, 'cert', PEM_CERT, { ttl: 1000 });
    vi.advanceTimersByTime(5000);
    // PEM ignores TTL — should still be accessible
    expect(store.getData(Boundary.device, 'cert')).toBe(PEM_CERT);
  });
});

// ===========================================================================
// 10. Reactivity — observeData / addListener
// ===========================================================================

describe('Reactivity', () => {
  it('observeData emits when setData is called', () => {
    const store = createStore();
    const values: any[] = [];

    const obs = store.observeData(Boundary.device, 'reactive-key');
    const sub = obs.subscribe((v) => values.push(v));

    store.setData(Boundary.device, 'reactive-key', 'a');
    store.setData(Boundary.device, 'reactive-key', 'b');

    expect(values).toEqual(['a', 'b']);
    sub.unsubscribe();
  });

  it('observeData with dataPath emits nested value', () => {
    const store = createStore();
    const themes: string[] = [];

    const obs = store.observeData(Boundary.device, 'settings', { dataPath: 'ui.theme' });
    obs.subscribe((v) => themes.push(v));

    store.setData(Boundary.device, 'settings', { ui: { theme: 'dark' }, lang: 'en' });
    store.setData(Boundary.device, 'settings', 'light', { dataPath: 'ui.theme' });

    expect(themes).toEqual(['dark', 'light']);
  });

  it('unsubscribe stops further notifications', () => {
    const store = createStore();
    const values: any[] = [];

    const sub = store.observeData(Boundary.device, 'k').subscribe((v) => values.push(v));
    store.setData(Boundary.device, 'k', 1);
    sub.unsubscribe();
    store.setData(Boundary.device, 'k', 2);

    expect(values).toEqual([1]);
  });

  it('addListener receives changes', () => {
    const store = createStore();
    const cb = vi.fn();

    store.addListener('l1', Boundary.device, 'k', cb);
    store.setData(Boundary.device, 'k', 'hello');

    expect(cb).toHaveBeenCalledWith('hello');
  });

  it('removeListener stops callback', () => {
    const store = createStore();
    const cb = vi.fn();

    store.addListener('l1', Boundary.device, 'k', cb);
    store.setData(Boundary.device, 'k', 'a');
    store.removeListener('l1');
    store.setData(Boundary.device, 'k', 'b');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('a');
  });

  it('clearAllListeners clears everything', () => {
    const store = createStore();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    store.addListener('l1', Boundary.device, 'k1', cb1);
    store.addListener('l2', Boundary.device, 'k2', cb2);
    store.clearAllListeners();

    store.setData(Boundary.device, 'k1', 'x');
    store.setData(Boundary.device, 'k2', 'y');

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('deleteData emits undefined to observers', () => {
    const store = createStore();
    const values: any[] = [];

    store.observeData(Boundary.device, 'k').subscribe((v) => values.push(v));
    store.setData(Boundary.device, 'k', 'exists');
    store.deleteData(Boundary.device, 'k');

    expect(values).toEqual(['exists', undefined]);
  });
});

// ===========================================================================
// 11. Batch Operations
// ===========================================================================

describe('Batch', () => {
  it('batchSet stores multiple entries at once', () => {
    const store = createStore();
    store.batchSet([
      { boundary: Boundary.device, key: 'a', value: 1 },
      { boundary: Boundary.device, key: 'b', value: 2 },
      { boundary: Boundary.device, key: 'c', value: 3 },
    ]);
    expect(store.getData(Boundary.device, 'a')).toBe(1);
    expect(store.getData(Boundary.device, 'b')).toBe(2);
    expect(store.getData(Boundary.device, 'c')).toBe(3);
  });

  it('batchGet retrieves multiple entries', () => {
    const store = createStore();
    store.setData(Boundary.device, 'x', 10);
    store.setData(Boundary.device, 'y', 20);

    const results = store.batchGet([
      { boundary: Boundary.device, key: 'x' },
      { boundary: Boundary.device, key: 'y' },
      { boundary: Boundary.device, key: 'z' },
    ]);

    expect(results).toEqual([
      { boundary: Boundary.device, key: 'x', value: 10 },
      { boundary: Boundary.device, key: 'y', value: 20 },
      { boundary: Boundary.device, key: 'z', value: undefined },
    ]);
  });
});

// ===========================================================================
// 12. Query — findKeys / clearData
// ===========================================================================

describe('Query', () => {
  it('findKeys returns keys matching partial prefix', () => {
    const store = createStore();
    store.setData(Boundary.device, 'app/settings', 1);
    store.setData(Boundary.device, 'app/profile', 2);
    store.setData(Boundary.device, 'other', 3);

    const keys = store.findKeys(Boundary.device, 'app/');
    expect(keys.sort()).toEqual(['app/profile', 'app/settings']);
  });

  it('findKeys with empty partial returns all keys', () => {
    const store = createStore();
    store.setData(Boundary.device, 'a', 1);
    store.setData(Boundary.device, 'b', 2);

    const keys = store.findKeys(Boundary.device, '');
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  it('clearData removes all entries for a boundary', () => {
    const store = createStore();
    store.setData(Boundary.device, 'a', 1);
    store.setData(Boundary.device, 'b', 2);

    store.clearData(Boundary.device);

    expect(store.getData(Boundary.device, 'a')).toBeUndefined();
    expect(store.getData(Boundary.device, 'b')).toBeUndefined();
  });

  it('clearData with partialKey removes only matching', () => {
    const store = createStore();
    store.setData(Boundary.device, 'cache/img', 'x');
    store.setData(Boundary.device, 'cache/json', 'y');
    store.setData(Boundary.device, 'settings', 'z');

    store.clearData(Boundary.device, { partialKey: 'cache/' });

    expect(store.getData(Boundary.device, 'cache/img')).toBeUndefined();
    expect(store.getData(Boundary.device, 'cache/json')).toBeUndefined();
    expect(store.getData(Boundary.device, 'settings')).toBe('z');
  });
});

// ===========================================================================
// 13. Export / Import
// ===========================================================================

describe('Export / Import', () => {
  it('exportData returns all entries for a boundary', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k1', 'v1');
    store.setData(Boundary.device, 'k2', 'v2');

    const data = store.exportData(Boundary.device);
    expect(Object.keys(data).sort()).toEqual(['k1', 'k2']);
    expect(data['k1'].data).toBe('v1');
  });

  it('importData restores entries', () => {
    const store1 = createStore();
    store1.setData(Boundary.device, 'migrated', 'original');
    const exported = store1.exportData(Boundary.device);

    store1.clearData(Boundary.device);
    expect(store1.getData(Boundary.device, 'migrated')).toBeUndefined();

    store1.importData(Boundary.device, exported);
    expect(store1.getData(Boundary.device, 'migrated')).toBe('original');
  });

  it('importData with overwrite=false does not replace existing', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', 'existing');

    const imported = { k: { data: 'imported', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiry: null, appName: 'x', appVersion: '0', sdkVersion: '0' } };
    store.importData(Boundary.device, imported, { overwrite: false });
    expect(store.getData(Boundary.device, 'k')).toBe('existing');
  });

  it('importData with overwrite=true replaces existing', () => {
    const store = createStore();
    store.setData(Boundary.device, 'k', 'old');

    const imported = { k: { data: 'new', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiry: null, appName: 'x', appVersion: '0', sdkVersion: '0' } };
    store.importData(Boundary.device, imported, { overwrite: true });
    expect(store.getData(Boundary.device, 'k')).toBe('new');
  });
});

// ===========================================================================
// 14. Server Time
// ===========================================================================

describe('Server Time', () => {
  it('getServerTime calls the delegate', async () => {
    const delegate = vi.fn(async () => new Date('2026-07-01T12:00:00Z'));
    const store = createStore({ onRequestServerTime: delegate });

    const time = await store.getServerTime();
    expect(delegate).toHaveBeenCalled();
    expect(time.getFullYear()).toBe(2026);
  });

  it('getServerTime falls back to device time on failure', async () => {
    const delegate = vi.fn(async () => null);
    const logFn = vi.fn();
    const store = createStore({ onRequestServerTime: delegate, onLog: logFn });

    const before = Date.now();
    const time = await store.getServerTime();
    const after = Date.now();

    expect(time.getTime()).toBeGreaterThanOrEqual(before);
    expect(time.getTime()).toBeLessThanOrEqual(after + 100);

    const errorLog = logFn.mock.calls.find(([l]: [LogLevel]) => l === 'error');
    expect(errorLog).toBeDefined();
  });

  it('getServerTime caches and reuses within TTL', async () => {
    const delegate = vi.fn(async () => new Date('2026-07-01T12:00:00Z'));
    const store = createStore({ onRequestServerTime: delegate, serverTimeTtl: 60000 });

    await store.getServerTime();
    await store.getServerTime();
    await store.getServerTime();

    expect(delegate).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 15. Error Handling & Logging
// ===========================================================================

describe('Error Handling', () => {
  it('logs warning when writing to encrypted storage without key', () => {
    const logFn = vi.fn();
    const store = createStore({ onLog: logFn });

    store.setData(Boundary.device, 'x', 'y', { storage: Storage.secureStorageEncrypted });

    const warn = logFn.mock.calls.find(([l]: [LogLevel]) => l === 'warn');
    expect(warn).toBeDefined();
    expect(warn![1]).toContain('Encryption key not set');
  });

  it('logs warning when identity is missing for boundary', () => {
    const logFn = vi.fn();
    const store = createStore({ onLog: logFn });

    store.setData(Boundary.user, 'k', 'v'); // no activeUser set

    const warn = logFn.mock.calls.find(([l]: [LogLevel]) => l === 'warn');
    expect(warn).toBeDefined();
    expect(warn![1]).toContain('identity not set');
  });

  it('subscriber errors do not propagate', () => {
    const store = createStore();
    const good = vi.fn();

    store.observeData(Boundary.device, 'k').subscribe(() => {
      throw new Error('boom');
    });
    store.observeData(Boundary.device, 'k').subscribe(good);

    store.setData(Boundary.device, 'k', 'val');
    expect(good).toHaveBeenCalledWith('val');
  });

  it('listener errors do not propagate', () => {
    const store = createStore();
    const good = vi.fn();

    store.addListener('bad', Boundary.device, 'k', () => {
      throw new Error('crash');
    });
    store.addListener('good', Boundary.device, 'k', good);

    store.setData(Boundary.device, 'k', 'val');
    expect(good).toHaveBeenCalledWith('val');
  });
});

// ===========================================================================
// 16. Edge Cases
// ===========================================================================

describe('Edge Cases', () => {
  it('handles empty string as value', () => {
    const store = createStore();
    store.setData(Boundary.device, 'empty', '');
    expect(store.getData(Boundary.device, 'empty')).toBe('');
  });

  it('handles null as value', () => {
    const store = createStore();
    store.setData(Boundary.device, 'nil', null);
    expect(store.getData(Boundary.device, 'nil')).toBeNull();
  });

  it('handles numeric zero as value', () => {
    const store = createStore();
    store.setData(Boundary.device, 'zero', 0);
    expect(store.getData(Boundary.device, 'zero')).toBe(0);
  });

  it('handles boolean false as value', () => {
    const store = createStore();
    store.setData(Boundary.device, 'flag', false);
    expect(store.getData(Boundary.device, 'flag')).toBe(false);
  });

  it('handles deeply nested objects', () => {
    const store = createStore();
    const deep = { a: { b: { c: { d: { e: 'deep' } } } } };
    store.setData(Boundary.device, 'deep', deep);
    expect(store.getData(Boundary.device, 'deep', { dataPath: 'a.b.c.d.e' })).toBe('deep');
  });

  it('handles array values', () => {
    const store = createStore();
    store.setData(Boundary.device, 'list', [1, 2, 3]);
    expect(store.getData(Boundary.device, 'list')).toEqual([1, 2, 3]);
  });

  it('handles keys with slashes', () => {
    const store = createStore();
    store.setData(Boundary.device, 'loan-app/instance-1/form', { step: 3 });
    expect(store.getData(Boundary.device, 'loan-app/instance-1/form')).toEqual({ step: 3 });
  });
});
