/**
 * useView Hook
 */

import { ref, computed, onUnmounted } from 'vue';
import type { ViewDefinition, ViewState } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useView(viewId?: string) {
  const sdk = useVNextSDK();
  const definition = ref<ViewDefinition | undefined>();
  const state = ref<ViewState | undefined>();
  const loading = ref(false);
  const errors = ref<Record<string, string>>({});

  const data = computed(() => state.value?.data || {});
  const isValid = computed(() => Object.keys(errors.value).length === 0);

  // Subscribe to data changes
  const dataUnsubscribe = sdk.view.onDataChange((newData) => {
    if (!viewId || Object.keys(newData).includes(viewId)) {
      state.value = sdk.view.getData()[viewId || ''] as any;
    }
  });

  // Subscribe to validation changes
  const validationUnsubscribe = sdk.view.onValidationChange((newErrors) => {
    errors.value = newErrors;
  });

  onUnmounted(() => {
    dataUnsubscribe();
    validationUnsubscribe();
  });

  const load = async (id: string) => {
    loading.value = true;
    try {
      const def = await sdk.view.load(id);
      definition.value = def;
      return def;
    } finally {
      loading.value = false;
    }
  };

  const render = async (container?: HTMLElement | string) => {
    if (!definition.value) {
      throw new Error('View definition not loaded');
    }
    await sdk.view.render(definition.value, container);
  };

  const updateData = (path: string, value: any) => {
    const fullPath = viewId ? `${viewId}.${path}` : path;
    sdk.view.updateData(fullPath, value);
  };

  const validate = () => {
    return sdk.view.validate();
  };

  const reset = () => {
    sdk.view.reset();
  };

  return {
    definition: computed(() => definition.value),
    state: computed(() => state.value),
    data,
    errors: computed(() => errors.value),
    isValid,
    loading,
    load,
    render,
    updateData,
    validate,
    reset,
  };
}

