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
 * Vue Plugin Options
 */
export interface VuePluginOptions {
  /**
   * Environment endpoint URL
   * Example: "/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment"
   * or full URL: "http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment"
   */
  environmentEndpoint: string;
  
  /**
   * Application/Client key
   * Example: "web-app"
   */
  appKey: string;
  
  /**
   * Optional: Override default stage selection
   */
  defaultStage?: string;
  
  /**
   * Optional: Enable debug/verbose logging
   */
  debug?: boolean;
}

/**
 * Vue Plugin
 */
export const VNextVuePlugin = {
  install(app: App, options: VuePluginOptions) {
    if (!options.environmentEndpoint || !options.appKey) {
      throw new Error('VNextVuePlugin requires environmentEndpoint and appKey');
    }

    // Convert Vue plugin options to ClientOptions
    const clientOptions: ClientOptions = {
      environmentEndpoint: options.environmentEndpoint,
      appKey: options.appKey,
      defaultStage: options.defaultStage,
      debug: options.debug,
    };

    const sdk = new SDK(clientOptions);
    
    // Provide SDK instance
    app.provide(VNextSDKKey, sdk);

    // Initialize SDK (loads environment, client config, etc.)
    sdk.initialize().catch(console.error);

    // Cleanup on app unmount
    app.config.globalProperties.$vnext = sdk;
  },
};

export default VNextVuePlugin;

