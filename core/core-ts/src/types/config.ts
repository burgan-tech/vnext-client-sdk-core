/**
 * Configuration Types
 */

export type Environment = 'development' | 'staging' | 'production';

export interface SdkConfig {
  apiBaseUrl: string;
  wsBaseUrl?: string;
  environment?: Environment;
  apiVersion?: string;
  timeout?: number;
  retryConfig?: {
    maxRetries?: number;
    retryDelay?: number;
  };
  auth?: {
    storage?: 'localStorage' | 'sessionStorage' | 'memory';
    tokenRefreshThreshold?: number;
    autoRefresh?: boolean;
  };
  features?: {
    enableWebSocket?: boolean;
    enableStatePersistence?: boolean;
    enableLogging?: boolean;
  };
  debug?: boolean;
}

export interface ClientOptions {
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
   * If not provided, uses defaultStage from environments response
   */
  defaultStage?: string;
  
  /**
   * Optional: Enable debug/verbose logging
   */
  debug?: boolean;
  
  /**
   * Optional: Stage selection callback for onStartup mode
   * Called when multiStageMode is 'onStartup' to let user select stage
   * Should return a Promise that resolves with the selected stage ID
   */
  onStageSelection?: (stages: Array<{ id: string; name: string }>) => Promise<string>;
  
  /**
   * Optional: Additional SDK config overrides
   */
  config?: Partial<SdkConfig>;
  
  /**
   * Optional: Custom interceptors
   */
  interceptors?: {
    request?: Array<(config: any) => any | Promise<any>>;
    response?: Array<(response: any) => any | Promise<any>>;
    error?: Array<(error: any) => any | Promise<any>>;
  };
}

export interface EnvironmentConfig {
  apiBaseUrl: string;
  wsBaseUrl?: string;
  apiVersion?: string;
}

/**
 * Multi-stage selection mode
 * - never: Default stage always used, user cannot change
 * - onStartup: Show dialog on app startup to select stage, then fetch client config
 * - onProfile: App starts with default, user can change via "change environment" menu item in profile page
 */
export type MultiStageMode = 'never' | 'onStartup' | 'onProfile';

export interface EnvironmentsResponse {
  version: string;
  multiStageMode: MultiStageMode;
  defaultStage: string;
  stages: Array<{
    id: string;
    name: string;
    baseUrl: string;
    wsUrl?: string;
    mqttUrl?: string;
    configEndpoint: string;
  }>;
}
