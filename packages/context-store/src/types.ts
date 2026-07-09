export enum Boundary {
  device = 'device',
  user = 'user',
  subject = 'subject',
}

export enum Storage {
  secureStorage = 'secureStorage',
  secureStorageEncrypted = 'secureStorageEncrypted',
  memory = 'memory',
  localStorage = 'localStorage',
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Subscription = { unsubscribe(): void };
export type Observable<T> = { subscribe(callback: (value: T) => void): Subscription };

export type Envelope = {
  data: any;
  expiry: string | null;
  createdAt: string;
  updatedAt: string;
  appName: string;
  appVersion: string;
  sdkVersion: string;
};

export type ContextStoreOptions = {
  onRequestServerTime: (url: string, timeout: number) => Promise<Date | null>;
  timeServerUrls: string[];
  serverTimeTtl?: number;
  requestServerTimeTimeout?: number;
  onLog?: (level: LogLevel, message: string, error?: any, context?: Record<string, any>) => void;
  appName?: string;
  appVersion?: string;
};

export interface IContextStore {
  readonly activeDevice: string | null;
  activeUser: string | null;
  activeSubject: string | null;

  getServerTime(): Promise<Date>;

  setEncryptionKey(key: string): void;
  get isEncryptionKeySet(): boolean;
  revokeEncryptionKey(): void;

  setData(boundary: Boundary, key: string, value: any, options?: { storage?: Storage; ttl?: number; dataPath?: string }): void;
  getData<T = any>(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): T | undefined;
  getDataMetadata(boundary: Boundary, key: string, options?: { storage?: Storage }): Envelope | undefined;
  deleteData(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): void;

  batchSet(operations: Array<{ boundary: Boundary; key: string; value: any; storage?: Storage; ttl?: number }>): void;
  batchGet(operations: Array<{ boundary: Boundary; key: string; storage?: Storage }>): Array<{ boundary: Boundary; key: string; value: any }>;

  observeData(boundary: Boundary, key: string, options?: { storage?: Storage; dataPath?: string }): Observable<any>;
  addListener(listenerId: string, boundary: Boundary, key: string, callback: (value: any) => void, options?: { storage?: Storage; dataPath?: string }): void;
  removeListener(listenerId: string): void;
  clearAllListeners(): void;

  findKeys(boundary: Boundary, partialKey: string, options?: { storage?: Storage }): string[];
  clearData(boundary: Boundary, options?: { storage?: Storage; partialKey?: string }): void;

  exportData(boundary: Boundary, options?: { storage?: Storage; partialKey?: string }): Record<string, any>;
  importData(boundary: Boundary, data: Record<string, any>, options?: { storage?: Storage; overwrite?: boolean }): void;

  cleanup(options?: { boundary?: Boundary; storage?: Storage }): void;
}
