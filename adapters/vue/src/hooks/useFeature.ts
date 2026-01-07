/**
 * useFeature Hook
 */

import { ref, computed, onMounted } from 'vue';
import type { FeatureConfig, MenuConfig, MenuAction } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useFeature() {
  const sdk = useVNextSDK();
  const loading = ref(false);
  const initialized = ref(false);

  const menu = computed<MenuConfig | undefined>(() => sdk.feature.getMenu());
  const enabledFeatures = computed(() => sdk.feature.getEnabledFeatures());

  const initialize = async () => {
    loading.value = true;
    try {
      await sdk.feature.initialize();
      initialized.value = true;
    } catch (error) {
      console.error('Failed to initialize features:', error);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const getFeature = (id: string): FeatureConfig | undefined => {
    return sdk.feature.getFeature(id);
  };

  const isFeatureEnabled = (id: string): boolean => {
    return sdk.feature.isFeatureEnabled(id);
  };

  const executeAction = async (action: MenuAction) => {
    await sdk.feature.executeAction(action);
  };

  onMounted(() => {
    if (!initialized.value) {
      initialize();
    }
  });

  return {
    menu,
    enabledFeatures,
    loading,
    initialized,
    initialize,
    getFeature,
    isFeatureEnabled,
    executeAction,
  };
}

