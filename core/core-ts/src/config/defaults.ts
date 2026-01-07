/**
 * Default Configuration Values
 */

import type { SdkConfig } from '../types/config';

export const DEFAULT_CONFIG: Partial<SdkConfig> = {
  timeout: 30000, // 30 seconds
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
  },
  auth: {
    storage: 'localStorage',
    tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
    autoRefresh: true,
  },
  features: {
    enableWebSocket: true,
    enableStatePersistence: true,
    enableLogging: false,
  },
  debug: false,
  apiVersion: 'v1',
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig: Partial<SdkConfig>): SdkConfig {
  const merged: SdkConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    retryConfig: {
      ...DEFAULT_CONFIG.retryConfig,
      ...userConfig.retryConfig,
    },
    auth: {
      ...DEFAULT_CONFIG.auth,
      ...userConfig.auth,
    },
    features: {
      ...DEFAULT_CONFIG.features,
      ...userConfig.features,
    },
  } as SdkConfig;

  return merged;
}

