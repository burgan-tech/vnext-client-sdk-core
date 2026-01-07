/**
 * useState Hook
 */

import { ref, watch, computed, onUnmounted } from 'vue';
import type { StateSubscription } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useState<T = any>(path?: string) {
  const sdk = useVNextSDK();
  const value = ref<T | undefined>(sdk.state.get<T>(path));
  const subscriptions: StateSubscription[] = [];

  // Subscribe to changes
  if (path) {
    const subscription = sdk.state.subscribe(path, (newValue, previousValue) => {
      value.value = newValue;
    });
    subscriptions.push(subscription);
  } else {
    // Subscribe to all changes
    const unsubscribe = sdk.state.on('change', (event) => {
      if (!path || event.path === path) {
        value.value = sdk.state.get<T>(path);
      }
    });
    subscriptions.push({ id: 'all', unsubscribe } as StateSubscription);
  }

  const set = (newValue: T) => {
    if (path) {
      sdk.state.set(path, newValue);
    } else {
      throw new Error('Cannot set value without path');
    }
  };

  const update = (updater: (current: T) => T) => {
    if (path) {
      sdk.state.update(path, updater);
    } else {
      throw new Error('Cannot update value without path');
    }
  };

  const remove = () => {
    if (path) {
      sdk.state.delete(path);
    }
  };

  onUnmounted(() => {
    subscriptions.forEach(sub => sub.unsubscribe());
  });

  return {
    value: computed(() => value.value),
    set,
    update,
    remove,
  };
}

