/**
 * State Store
 */

import type {
  StateStoreConfig,
  StateSubscription,
  StateEvent,
  StateManager,
  StorageType,
} from '../types/state';
import { EventEmitter } from './event-emitter';
import { createStorageAdapter, type StorageAdapter } from './storage';

export class StateStore implements StateManager {
  private state: Map<string, any> = new Map();
  private subscriptions: Map<string, Set<(value: any, previousValue?: any) => void>> = new Map();
  private eventEmitter: EventEmitter;
  private storageAdapter?: StorageAdapter;
  private storageKey: string;
  private config: StateStoreConfig;

  constructor(config: StateStoreConfig = {}) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    this.storageKey = config.persistence?.key || 'vnext-state';

    if (config.persistence?.enabled) {
      this.storageAdapter = createStorageAdapter(config.persistence.storage || 'localStorage');
      this.restore();
    }
  }

  /**
   * Get value by path
   */
  get<T = any>(path?: string): T | undefined {
    if (!path) {
      // Return entire state as object
      const stateObj: any = {};
      this.state.forEach((value, key) => {
        stateObj[key] = value;
      });
      return stateObj as T;
    }

    return this.state.get(path) as T | undefined;
  }

  /**
   * Set value by path
   */
  set<T = any>(path: string, value: T): void {
    const previousValue = this.state.get(path);
    this.state.set(path, value);

    // Emit change event
    this.emitChangeEvent('set', path, value, previousValue);

    // Notify subscribers
    this.notifySubscribers(path, value, previousValue);

    // Persist if enabled
    if (this.config.persistence?.enabled) {
      this.persist();
    }
  }

  /**
   * Update value by path
   */
  update<T = any>(path: string, updater: (current: T) => T): void {
    const currentValue = this.get<T>(path);
    const newValue = updater(currentValue as T);
    this.set(path, newValue);
  }

  /**
   * Delete value by path
   */
  delete(path: string): void {
    const previousValue = this.state.get(path);
    this.state.delete(path);

    // Emit change event
    this.emitChangeEvent('delete', path, undefined, previousValue);

    // Notify subscribers
    this.notifySubscribers(path, undefined, previousValue);

    // Persist if enabled
    if (this.config.persistence?.enabled) {
      this.persist();
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    const previousState = new Map(this.state);
    this.state.clear();

    // Emit change event
    this.emitChangeEvent('clear', undefined, undefined, previousState);

    // Notify all subscribers
    this.subscriptions.forEach((callbacks, path) => {
      callbacks.forEach(callback => {
        callback(undefined, previousState.get(path));
      });
    });

    // Persist if enabled
    if (this.config.persistence?.enabled) {
      this.persist();
    }
  }

  /**
   * Subscribe to path changes
   */
  subscribe(
    path: string,
    callback: (value: any, previousValue?: any) => void
  ): StateSubscription {
    if (!this.subscriptions.has(path)) {
      this.subscriptions.set(path, new Set());
    }

    this.subscriptions.get(path)!.add(callback);

    const subscription: StateSubscription = {
      id: `${path}-${Date.now()}-${Math.random()}`,
      path,
      callback,
      unsubscribe: () => {
        const callbacks = this.subscriptions.get(path);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.subscriptions.delete(path);
          }
        }
      },
    };

    return subscription;
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: (event: StateEvent) => void): () => void {
    return this.eventEmitter.on(event, callback);
  }

  /**
   * Persist state to storage
   */
  persist(): void {
    if (!this.storageAdapter) return;

    const stateObj: Record<string, any> = {};
    this.state.forEach((value, key) => {
      stateObj[key] = value;
    });

    const serialized = this.config.persistence?.serialize
      ? this.config.persistence.serialize(stateObj)
      : JSON.stringify(stateObj);

    this.storageAdapter.setItem(this.storageKey, serialized);
  }

  /**
   * Restore state from storage
   */
  restore(): void {
    if (!this.storageAdapter) return;

    const serialized = this.storageAdapter.getItem(this.storageKey);
    if (!serialized) return;

    try {
      const stateObj = this.config.persistence?.deserialize
        ? this.config.persistence.deserialize(serialized)
        : JSON.parse(serialized);

      Object.entries(stateObj).forEach(([key, value]) => {
        this.state.set(key, value);
      });
    } catch (error) {
      console.error('Failed to restore state:', error);
    }
  }

  /**
   * Notify subscribers of path change
   */
  private notifySubscribers(path: string, value: any, previousValue?: any): void {
    const callbacks = this.subscriptions.get(path);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(value, previousValue);
        } catch (error) {
          console.error(`Error in state subscriber for ${path}:`, error);
        }
      });
    }
  }

  /**
   * Emit state change event
   */
  private emitChangeEvent(
    type: StateEvent['type'],
    path?: string,
    value?: any,
    previousValue?: any
  ): void {
    const event: StateEvent = {
      type,
      path,
      value,
      previousValue,
      timestamp: Date.now(),
    };

    this.eventEmitter.emit('change', event);
    this.eventEmitter.emit(type, event);
  }
}

