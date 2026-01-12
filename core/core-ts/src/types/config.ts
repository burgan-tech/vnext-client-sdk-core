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

