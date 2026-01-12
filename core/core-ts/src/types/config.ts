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
   * 
   * If workflow is provided, workflowInstance will be passed as second parameter
   * The callback should handle workflow rendering and return the selected stage ID
   * 
   * @param stages Available stages to choose from
   * @param workflowInstance Optional workflow instance if backend-driven workflow is used
   * @returns Promise that resolves with the selected stage ID
   */
  onStageSelection?: (
    stages: Array<{ id: string; name: string }>,
    workflowInstance?: any
  ) => Promise<string>;
  
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

export interface StageSelectionWorkflow {
  /**
   * Runtime version (e.g., "v2")
   */
  runtime: string;
  
  /**
   * Base URL for the workflow API
   * Example: "http://localhost:3001"
   */
  baseUrl: string;
  
  /**
   * Domain for the workflow
   * Example: "discovery"
   */
  domain: string;
  
  /**
   * Workflow name/identifier
   * Example: "stage-selector"
   */
  workflow: string;
  
  /**
   * Workflow version
   * Example: "1.1"
   */
  version: string;
  
  /**
   * Optional comment showing the built URL (for reference)
   */
  _comment?: string;
}

export interface EnvironmentsResponse {
  version: string;
  multiStageMode: MultiStageMode;
  defaultStage: string;
  /**
   * Optional: Backend-driven workflow for stage selection
   * When provided, this workflow will be used for stage selection instead of simple dialog
   * The workflow will handle the UI and return the selected stage ID
   */
  workflow?: StageSelectionWorkflow;
  stages: Array<{
    id: string;
    name: string;
    baseUrl: string;
    wsUrl?: string;
    mqttUrl?: string;
    configEndpoint: string;
  }>;
}
