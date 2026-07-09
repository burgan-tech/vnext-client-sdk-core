import {
  Boundary,
  Storage,
  Envelope,
  ContextStoreOptions,
  Observable,
  Subscription,
  IContextStore,
} from './types';
import { ServerTimeManager } from './server-time';
import { encrypt, decrypt } from './crypto';

const SDK_VERSION = '0.1.0';
const KEY_PREFIX = 'cs';

// ---------------------------------------------------------------------------
// Internal Subject (minimal pub-sub)
// ---------------------------------------------------------------------------

class Subject<T> {
  private subs = new Set<(v: T) => void>();
  next(v: T) {
    for (const cb of this.subs) {
      try {
        cb(v);
      } catch {
        /* subscriber errors must not propagate */
      }
    }
  }
  subscribe(cb: (v: T) => void): Subscription {
    this.subs.add(cb);
    return { unsubscribe: () => this.subs.delete(cb) };
  }
  clear() {
    this.subs.clear();
  }
}

// ---------------------------------------------------------------------------
// Listener bookkeeping
// ---------------------------------------------------------------------------

type ListenerEntry = {
  id: string;
  boundary: Boundary;
  key: string;
  storage: Storage;
  dataPath?: string;
  callback: (value: any) => void;
};

// ---------------------------------------------------------------------------
// ContextStore
// ---------------------------------------------------------------------------

export class ContextStore implements IContextStore {
  // Identity
  private _activeDevice: string | null = null;
  private _activeUser: string | null = null;
  private _activeSubject: string | null = null;

  // Storage
  private memoryStore = new Map<string, string>();
  private encryptionKey: string | null = null;

  // Time
  private timeManager: ServerTimeManager;

  // Metadata
  private log: ContextStoreOptions['onLog'];
  private appName: string;
  private appVersion: string;

  // Reactivity
  private listeners = new Map<string, ListenerEntry>();
  private subjectsByStorageKey = new Map<string, Subject<any>[]>();

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  private constructor(options: ContextStoreOptions) {
    this.timeManager = new ServerTimeManager(options);
    this.log = options.onLog;
    this.appName = options.appName ?? this.detectAppName();
    this.appVersion = options.appVersion ?? this.detectAppVersion();
    this._activeDevice = this.initDeviceId();
  }

  static create(options: ContextStoreOptions): ContextStore {
    return new ContextStore(options);
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  get activeDevice(): string | null {
    return this._activeDevice;
  }

  get activeUser(): string | null {
    return this._activeUser;
  }
  set activeUser(value: string | null) {
    this._activeUser = value;
  }

  get activeSubject(): string | null {
    return this._activeSubject;
  }
  set activeSubject(value: string | null) {
    this._activeSubject = value;
  }

  async getServerTime(): Promise<Date> {
    return this.timeManager.getServerTime();
  }

  // ---------------------------------------------------------------------------
  // Encryption Key
  // ---------------------------------------------------------------------------

  setEncryptionKey(key: string): void {
    this.encryptionKey = key;
  }

  get isEncryptionKeySet(): boolean {
    return this.encryptionKey !== null;
  }

  revokeEncryptionKey(): void {
    this.encryptionKey = null;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  setData(
    boundary: Boundary,
    key: string,
    value: any,
    options?: { storage?: Storage; ttl?: number; dataPath?: string },
  ): void {
    const storage = options?.storage ?? Storage.secureStorage;
    const storageKey = this.buildStorageKey(storage, boundary, key);
    if (!storageKey) {
      this.log?.('warn', 'Cannot resolve storage key — identity not set', undefined, { boundary, key });
      return;
    }

    // PEM/DER bypass
    if (this.isPemOrDer(value)) {
      this.writeRaw(storage, storageKey, typeof value === 'string' ? value : JSON.stringify(value));
      this.emit(storageKey, value);
      return;
    }

    const now = this.timeManager.getNow();
    const existing = this.readEnvelope(storage, storageKey);

    let targetValue = value;
    if (options?.dataPath && existing) {
      const obj = structuredClone(existing.data);
      setNested(obj, options.dataPath, value);
      targetValue = obj;
    }

    const envelope = existing
      ? this.touchEnvelope(existing, targetValue, now, options?.ttl)
      : this.makeEnvelope(targetValue, now, options?.ttl);

    this.writeRaw(storage, storageKey, JSON.stringify(envelope));

    this.emit(storageKey, envelope.data);
  }

  getData<T = any>(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): T | undefined {
    const storage = options?.storage ?? Storage.secureStorage;
    const storageKey = this.buildStorageKey(storage, boundary, key);
    if (!storageKey) return undefined;

    const raw = this.readRaw(storage, storageKey);
    if (raw === null) return undefined;

    if (raw.trimStart().startsWith('-----BEGIN')) {
      return raw as unknown as T;
    }

    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!envelope.createdAt) return raw as unknown as T;

    const now = this.timeManager.getNow();
    if (envelope.expiry && now >= new Date(envelope.expiry)) {
      this.deleteRaw(storage, storageKey);
      this.log?.('debug', 'Lazy cleanup: expired entry removed', undefined, { boundary, key });
      return undefined;
    }

    const data = envelope.data;
    return options?.dataPath ? getNested(data, options.dataPath) : data;
  }

  getDataMetadata(boundary: Boundary, key: string, options?: { storage?: Storage }): Envelope | undefined {
    const storage = options?.storage ?? Storage.secureStorage;
    const storageKey = this.buildStorageKey(storage, boundary, key);
    if (!storageKey) return undefined;
    return this.readEnvelope(storage, storageKey) ?? undefined;
  }

  deleteData(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): void {
    const storage = options?.storage ?? Storage.secureStorage;
    const storageKey = this.buildStorageKey(storage, boundary, key);
    if (!storageKey) return;

    if (options?.dataPath) {
      const envelope = this.readEnvelope(storage, storageKey);
      if (envelope) {
        const obj = structuredClone(envelope.data);
        deleteNested(obj, options.dataPath);
        const updated = this.touchEnvelope(envelope, obj, this.timeManager.getNow());
        this.writeRaw(storage, storageKey, JSON.stringify(updated));
        this.emit(storageKey, obj);
      }
      return;
    }

    this.deleteRaw(storage, storageKey);
    this.emit(storageKey, undefined);
  }

  // ---------------------------------------------------------------------------
  // Batch
  // ---------------------------------------------------------------------------

  batchSet(operations: Array<{ boundary: Boundary; key: string; value: any; storage?: Storage; ttl?: number }>): void {
    for (const op of operations) {
      this.setData(op.boundary, op.key, op.value, { storage: op.storage, ttl: op.ttl });
    }
  }

  batchGet(
    operations: Array<{ boundary: Boundary; key: string; storage?: Storage }>,
  ): Array<{ boundary: Boundary; key: string; value: any }> {
    return operations.map((op) => ({
      boundary: op.boundary,
      key: op.key,
      value: this.getData(op.boundary, op.key, { storage: op.storage }),
    }));
  }

  // ---------------------------------------------------------------------------
  // Observe / Listen
  // ---------------------------------------------------------------------------

  observeData(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): Observable<any> {
    const storage = options?.storage ?? Storage.secureStorage;
    const storageKey = this.buildStorageKey(storage, boundary, key);

    const subject = new Subject<any>();

    if (storageKey) {
      const list = this.subjectsByStorageKey.get(storageKey) ?? [];
      list.push(subject);
      this.subjectsByStorageKey.set(storageKey, list);
    }

    return {
      subscribe: (callback: (value: any) => void): Subscription => {
        const inner = subject.subscribe((value) => {
          callback(options?.dataPath ? getNested(value, options.dataPath) : value);
        });
        return {
          unsubscribe: () => {
            inner.unsubscribe();
            if (storageKey) {
              const arr = this.subjectsByStorageKey.get(storageKey);
              if (arr) {
                const idx = arr.indexOf(subject);
                if (idx !== -1) arr.splice(idx, 1);
                if (arr.length === 0) this.subjectsByStorageKey.delete(storageKey);
              }
            }
          },
        };
      },
    };
  }

  addListener(
    listenerId: string,
    boundary: Boundary,
    key: string,
    callback: (value: any) => void,
    options?: { storage?: Storage; dataPath?: string },
  ): void {
    const storage = options?.storage ?? Storage.secureStorage;
    this.listeners.set(listenerId, { id: listenerId, boundary, key, storage, dataPath: options?.dataPath, callback });
  }

  removeListener(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  clearAllListeners(): void {
    this.listeners.clear();
    for (const list of this.subjectsByStorageKey.values()) {
      for (const s of list) s.clear();
    }
    this.subjectsByStorageKey.clear();
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  findKeys(boundary: Boundary, partialKey: string, options?: { storage?: Storage }): string[] {
    const storage = options?.storage ?? Storage.secureStorage;
    const prefix = this.buildKeyPrefix(storage, boundary);
    if (!prefix) return [];

    const needle = partialKey ? `${prefix}:${partialKey}` : `${prefix}:`;
    return this.allKeysIn(storage)
      .filter((k) => k.startsWith(needle))
      .map((k) => k.slice(prefix.length + 1));
  }

  clearData(boundary: Boundary, options?: { storage?: Storage; partialKey?: string }): void {
    const storage = options?.storage ?? Storage.secureStorage;
    const prefix = this.buildKeyPrefix(storage, boundary);
    if (!prefix) return;

    const needle = options?.partialKey ? `${prefix}:${options.partialKey}` : `${prefix}:`;
    for (const k of this.allKeysIn(storage)) {
      if (k.startsWith(needle)) this.deleteRaw(storage, k);
    }
  }

  // ---------------------------------------------------------------------------
  // Export / Import
  // ---------------------------------------------------------------------------

  exportData(boundary: Boundary, options?: { storage?: Storage; partialKey?: string }): Record<string, any> {
    const storage = options?.storage ?? Storage.secureStorage;
    const prefix = this.buildKeyPrefix(storage, boundary);
    if (!prefix) return {};

    const needle = options?.partialKey ? `${prefix}:${options.partialKey}` : `${prefix}:`;
    const result: Record<string, any> = {};

    for (const k of this.allKeysIn(storage)) {
      if (!k.startsWith(needle)) continue;
      const raw = this.readRaw(storage, k);
      if (raw === null) continue;
      const userKey = k.slice(prefix.length + 1);
      try {
        result[userKey] = JSON.parse(raw);
      } catch {
        result[userKey] = raw;
      }
    }
    return result;
  }

  importData(boundary: Boundary, data: Record<string, any>, options?: { storage?: Storage; overwrite?: boolean }): void {
    const storage = options?.storage ?? Storage.secureStorage;
    const overwrite = options?.overwrite ?? false;

    for (const [key, value] of Object.entries(data)) {
      const storageKey = this.buildStorageKey(storage, boundary, key);
      if (!storageKey) continue;
      if (!overwrite && this.readRaw(storage, storageKey) !== null) continue;
      this.writeRaw(storage, storageKey, JSON.stringify(value));
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  cleanup(options?: { boundary?: Boundary; storage?: Storage }): void {
    const boundaries = options?.boundary ? [options.boundary] : [Boundary.device, Boundary.user, Boundary.subject];
    const storages = options?.storage
      ? [options.storage]
      : [Storage.secureStorage, Storage.secureStorageEncrypted, Storage.memory, Storage.localStorage];

    const now = this.timeManager.getNow();
    let cleaned = 0;

    for (const storage of storages) {
      for (const boundary of boundaries) {
        const prefix = this.buildKeyPrefix(storage, boundary);
        if (!prefix) continue;

        for (const k of this.allKeysIn(storage)) {
          if (!k.startsWith(`${prefix}:`)) continue;
          const raw = this.readRaw(storage, k);
          if (raw === null) continue;
          try {
            const env: Envelope = JSON.parse(raw);
            if (env.expiry && now >= new Date(env.expiry)) {
              this.deleteRaw(storage, k);
              cleaned++;
            }
          } catch {
            /* not an envelope — skip */
          }
        }
      }
    }

    this.log?.('info', `Cleanup completed: ${cleaned} expired entries removed`);
  }

  // ===========================================================================
  // Private — storage plumbing
  // ===========================================================================

  private buildStorageKey(storage: Storage, boundary: Boundary, key: string): string | null {
    const prefix = this.buildKeyPrefix(storage, boundary);
    return prefix ? `${prefix}:${key}` : null;
  }

  private buildKeyPrefix(storage: Storage, boundary: Boundary): string | null {
    const identity = this.identityScope(boundary);
    return identity ? `${KEY_PREFIX}:${storage}:${boundary}:${identity}` : null;
  }

  private identityScope(boundary: Boundary): string | null {
    const d = this._activeDevice;
    if (!d) return null;
    switch (boundary) {
      case Boundary.device:
        return d;
      case Boundary.user:
        return this._activeUser ? `${d}:${this._activeUser}` : null;
      case Boundary.subject:
        return this._activeUser && this._activeSubject
          ? `${d}:${this._activeUser}:${this._activeSubject}`
          : null;
    }
  }

  private readRaw(storage: Storage, key: string): string | null {
    this.log?.('debug', `readRaw [${storage}] ${key}`);

    if (storage === Storage.memory) return this.memoryStore.get(key) ?? null;

    if (storage === Storage.secureStorageEncrypted) {
      if (!this.encryptionKey) {
        this.log?.('warn', 'Encryption key not set — cannot read encrypted storage');
        return null;
      }
      const cipher = globalThis.localStorage.getItem(key);
      if (!cipher) return null;
      try {
        const plain = decrypt(cipher, this.encryptionKey);
        this.log?.('debug', 'Encrypted read OK');
        return plain;
      } catch (err) {
        this.log?.('error', 'Decryption failed — wrong encryption key', err);
        return null;
      }
    }

    return globalThis.localStorage.getItem(key);
  }

  private writeRaw(storage: Storage, key: string, value: string): void {
    this.log?.('debug', `writeRaw [${storage}] ${key}`);

    if (storage === Storage.memory) {
      this.memoryStore.set(key, value);
      return;
    }

    if (storage === Storage.secureStorageEncrypted) {
      if (!this.encryptionKey) {
        this.log?.('warn', 'Encryption key not set — cannot write to encrypted storage');
        return;
      }
      try {
        globalThis.localStorage.setItem(key, encrypt(value, this.encryptionKey));
      } catch (err) {
        this.log?.('error', 'Encryption / storage write failed', err);
      }
      return;
    }

    try {
      globalThis.localStorage.setItem(key, value);
    } catch (err) {
      this.log?.('error', 'Storage write failed', err);
    }
  }

  private deleteRaw(storage: Storage, key: string): void {
    if (storage === Storage.memory) {
      this.memoryStore.delete(key);
      return;
    }
    globalThis.localStorage.removeItem(key);
  }

  private allKeysIn(storage: Storage): string[] {
    if (storage === Storage.memory) return [...this.memoryStore.keys()];
    const keys: string[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const k = globalThis.localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX)) keys.push(k);
    }
    return keys;
  }

  // ===========================================================================
  // Private — envelope helpers
  // ===========================================================================

  private readEnvelope(storage: Storage, storageKey: string): Envelope | null {
    const raw = this.readRaw(storage, storageKey);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return obj.createdAt ? (obj as Envelope) : null;
    } catch {
      return null;
    }
  }

  private makeEnvelope(data: any, now: Date, ttl?: number): Envelope {
    const iso = now.toISOString();
    return {
      data,
      expiry: ttl ? new Date(now.getTime() + ttl).toISOString() : null,
      createdAt: iso,
      updatedAt: iso,
      appName: this.appName,
      appVersion: this.appVersion,
      sdkVersion: SDK_VERSION,
    };
  }

  private touchEnvelope(existing: Envelope, data: any, now: Date, ttl?: number): Envelope {
    return {
      ...existing,
      data,
      updatedAt: now.toISOString(),
      expiry: ttl ? new Date(now.getTime() + ttl).toISOString() : existing.expiry,
      appName: this.appName,
      appVersion: this.appVersion,
      sdkVersion: SDK_VERSION,
    };
  }

  // ===========================================================================
  // Private — reactivity
  // ===========================================================================

  private emit(storageKey: string, value: any): void {
    for (const l of this.listeners.values()) {
      const lk = this.buildStorageKey(l.storage, l.boundary, l.key);
      if (lk !== storageKey) continue;
      const v = l.dataPath ? getNested(value, l.dataPath) : value;
      try {
        l.callback(v);
      } catch {
        /* listener errors must not propagate */
      }
    }

    const subs = this.subjectsByStorageKey.get(storageKey);
    if (subs) for (const s of subs) s.next(value);
  }

  // ===========================================================================
  // Private — platform detection
  // ===========================================================================

  private isPemOrDer(value: any): boolean {
    if (typeof value === 'string') return value.trimStart().startsWith('-----BEGIN');
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
    return false;
  }

  private initDeviceId(): string {
    const SESSION_KEY = 'cs:deviceId';
    let id = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (!id) {
      id = globalThis.crypto.randomUUID();
      globalThis.sessionStorage?.setItem(SESSION_KEY, id);
    }
    return id;
  }

  private detectAppName(): string {
    try {
      return globalThis.document?.title || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private detectAppVersion(): string {
    try {
      const meta = globalThis.document?.querySelector('meta[name="version"]');
      return meta?.getAttribute('content') ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}

// ===========================================================================
// Utility — nested property access
// ===========================================================================

function getNested(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setNested(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((o, k) => {
    if (o[k] == null) o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

function deleteNested(obj: any, path: string): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((o, k) => o?.[k], obj);
  if (target) delete target[last];
}
