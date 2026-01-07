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
  config?: Partial<SdkConfig>;
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

