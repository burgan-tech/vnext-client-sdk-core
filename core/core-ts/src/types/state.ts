/**
 * State Management Types
 */

export type StorageType = 'localStorage' | 'sessionStorage' | 'memory';

export interface StateStoreConfig {
  persistence?: {
    enabled: boolean;
    storage?: StorageType;
    key?: string;
    serialize?: (value: any) => string;
    deserialize?: (value: string) => any;
  };
}

export interface StateSubscription {
  id: string;
  path?: string;
  callback: (value: any, previousValue?: any) => void;
  unsubscribe: () => void;
}

export interface StateEvent {
  type: 'set' | 'update' | 'delete' | 'clear';
  path?: string;
  value?: any;
  previousValue?: any;
  timestamp: number;
}

export interface StateManager {
  get<T = any>(path?: string): T | undefined;
  set<T = any>(path: string, value: T): void;
  update<T = any>(path: string, updater: (current: T) => T): void;
  delete(path: string): void;
  clear(): void;
  subscribe(path: string, callback: (value: any, previousValue?: any) => void): StateSubscription;
  on(event: string, callback: (event: StateEvent) => void): () => void;
  persist(): void;
  restore(): void;
}

