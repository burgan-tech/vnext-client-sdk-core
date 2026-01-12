/**
 * VNext Vue Adapter
 * 
 * Vue 3 Composition API hooks and plugin for VNext TypeScript Core SDK
 */

import type { App } from 'vue';
import type { VNextSDK, ClientOptions } from '@vnext/core-ts';
import { VNextSDK as SDK } from '@vnext/core-ts';
import { VNextSDKKey } from './composables';
import type { MultiStageMode } from '@vnext/core-ts';

// Adapter-specific logger (using console with prefix)
const adapterLogger = {
  info: (...args: any[]) => console.log('%c[VueAdapter]', 'color: #9C27B0', ...args),
  debug: (...args: any[]) => console.log('%c[VueAdapter]', 'color: #888', ...args),
  warn: (...args: any[]) => console.warn('%c[VueAdapter]', 'color: #FF9800', ...args),
  error: (...args: any[]) => console.error('%c[VueAdapter]', 'color: #F44336', ...args),
};

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
  
  /**
   * Optional: Custom stage selection dialog component
   * If not provided, uses default dialog implementation
   */
  stageSelectionDialog?: any;
}

/**
 * Vue Plugin
 */
export const VNextVuePlugin = {
  install(app: App, options: VuePluginOptions) {
    if (!options.environmentEndpoint || !options.appKey) {
      throw new Error('VNextVuePlugin requires environmentEndpoint and appKey');
    }

    // Create stage selection dialog function
    const createStageSelectionDialog = (stages: Array<{ id: string; name: string }>): Promise<string> => {
      return new Promise((resolve, reject) => {
        adapterLogger.info('🔶 [VueAdapter] Showing stage selection dialog...', { stagesCount: stages.length });
        
        // Use custom dialog if provided
        if (options.stageSelectionDialog) {
          options.stageSelectionDialog(stages, resolve, reject);
          return;
        }

        // Default: Use browser prompt (simple but functional)
        // TODO: Replace with proper Vue dialog component in app context
        const stageList = stages.map((s, i) => `${i + 1}. ${s.name} (${s.id})`).join('\n');
        const message = `Select environment:\n\n${stageList}\n\nEnter stage ID:`;
        const defaultId = stages[0]?.id || '';
        const selected = prompt(message, defaultId);
        
        if (selected && stages.find(s => s.id === selected)) {
          adapterLogger.info('✅ [VueAdapter] Stage selected:', selected);
          resolve(selected);
        } else if (selected === null) {
          adapterLogger.warn('⚠️ [VueAdapter] Stage selection cancelled by user');
          reject(new Error('Stage selection cancelled by user'));
        } else {
          adapterLogger.error('❌ [VueAdapter] Invalid stage ID:', selected);
          reject(new Error(`Invalid stage ID: ${selected}`));
        }
      });
    };

    // Convert Vue plugin options to ClientOptions
    const clientOptions: ClientOptions = {
      environmentEndpoint: options.environmentEndpoint,
      appKey: options.appKey,
      defaultStage: options.defaultStage,
      debug: options.debug,
      onStageSelection: createStageSelectionDialog,
    };

    adapterLogger.info('🔌 [VueAdapter] Installing VNext Vue plugin...', { 
      environmentEndpoint: options.environmentEndpoint,
      appKey: options.appKey,
    });

    const sdk = new SDK(clientOptions);
    
    // Provide SDK instance
    app.provide(VNextSDKKey, sdk);

    adapterLogger.info('🔌 [VueAdapter] SDK instance created, initializing...');

    // Initialize SDK (loads environment, client config, etc.)
    sdk.initialize()
      .then(() => {
        adapterLogger.info('✅ [VueAdapter] SDK initialization completed');
      })
      .catch((error) => {
        adapterLogger.error('❌ [VueAdapter] SDK initialization failed:', error);
        console.error(error);
      });

    // Cleanup on app unmount
    app.config.globalProperties.$vnext = sdk;
  },
};

export default VNextVuePlugin;

