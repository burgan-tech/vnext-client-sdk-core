/**
 * VNext Vue Adapter
 * 
 * Vue 3 Composition API hooks and plugin for VNext TypeScript Core SDK
 */

import type { App } from 'vue';
import type { VNextSDK, ClientOptions } from '@vnext/core-ts';
import { VNextSDK as SDK } from '@vnext/core-ts';
import { VNextSDKKey } from './composables';

// Export hooks
export { useAuth } from './hooks/useAuth';
export { useApi } from './hooks/useApi';
export { useWebSocket } from './hooks/useWebSocket';
export { useState } from './hooks/useState';
export { useFeature } from './hooks/useFeature';
export { useRouter } from './hooks/useRouter';
export { useWorkflow } from './hooks/useWorkflow';
export { useView } from './hooks/useView';
export { useVNextSDK } from './composables';

// Export types
export type * from '@vnext/core-ts';

/**
 * Vue Plugin
 */
export const VNextVuePlugin = {
  install(app: App, options?: ClientOptions) {
    const sdk = new SDK(options);
    
    // Provide SDK instance
    app.provide(VNextSDKKey, sdk);

    // Initialize SDK
    sdk.initialize().catch(console.error);

    // Cleanup on app unmount
    app.config.globalProperties.$vnext = sdk;
  },
};

export default VNextVuePlugin;

