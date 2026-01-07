/**
 * Configuration Module
 */

import type { SdkConfig, ClientOptions } from '../types/config';
import { detectEnvironment, getEnvironmentConfig } from './environment';
import { mergeConfig } from './defaults';

export * from './environment';
export * from './defaults';

/**
 * SDK Configuration Manager
 */
export class ConfigManager {
  private config: SdkConfig;

  constructor(options?: ClientOptions) {
    const env = detectEnvironment();
    const envConfig = getEnvironmentConfig(env);
    
    const userConfig: Partial<SdkConfig> = {
      ...envConfig,
      environment: env,
      ...options?.config,
    };

    this.config = mergeConfig(userConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): SdkConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SdkConfig>): void {
    this.config = mergeConfig({ ...this.config, ...updates });
  }

  /**
   * Get API base URL
   */
  getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  /**
   * Get WebSocket base URL
   */
  getWsBaseUrl(): string | undefined {
    return this.config.wsBaseUrl;
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.config.environment || 'development';
  }

  /**
   * Check if debug mode is enabled
   */
  isDebug(): boolean {
    return this.config.debug || false;
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: keyof NonNullable<SdkConfig['features']>): boolean {
    return this.config.features?.[feature] ?? false;
  }
}

