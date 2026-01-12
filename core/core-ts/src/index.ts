/**
 * VNext TypeScript Core SDK
 * 
 * Framework-agnostic core SDK for VNext low-code platform
 */

// Config
export * from './config';
export { ConfigManager } from './config';

// API Client
export * from './api';
export { ApiClient } from './api';
export { InterceptorManager } from './api';

// Authentication
export * from './auth';
export { AuthManager } from './auth';
export { DeviceAuth } from './auth';
export { OneFactorAuth } from './auth';
export { TwoFactorAuth } from './auth';
export { AuthUpgrade } from './auth';

// State Management
export * from './state';
export { StateStore } from './state';
export { EventEmitter } from './state';

// WebSocket
export * from './websocket';
export { WebSocketClient } from './websocket';

// Feature Manager
export * from './feature';
export { FeatureManager } from './feature';

// Router Manager
export * from './router';
export { RouterManager } from './router';

// Workflow Manager
export * from './workflow';
export { WorkflowManager } from './workflow';

// View Manager
export * from './view';
export { ViewManager } from './view';

// Types
export * from './types';

// Utils
export * from './utils/logger';

// Main SDK Class
import { ConfigManager } from './config';
import { ApiClient } from './api';
import { AuthManager } from './auth';
import { StateStore } from './state';
import { WebSocketClient } from './websocket';
import { FeatureManager } from './feature';
import { RouterManager } from './router';
import { WorkflowManager } from './workflow';
import { ViewManager } from './view';
import type { SdkConfig, ClientOptions } from './types/config';
import { logger, LogLevel } from './utils/logger';

export class VNextSDK {
  public readonly config: ConfigManager;
  public readonly api: ApiClient;
  public readonly auth: AuthManager;
  public readonly state: StateStore;
  public readonly websocket?: WebSocketClient;
  public readonly feature: FeatureManager;
  public readonly router: RouterManager;
  public readonly workflow: WorkflowManager;
  public readonly view: ViewManager;

  private options: ClientOptions;
  private initialized = false;

  constructor(options: ClientOptions) {
    if (!options.environmentEndpoint || !options.appKey) {
      throw new Error('VNextSDK requires environmentEndpoint and appKey in ClientOptions');
    }

    // Set logger level based on debug mode
    if (options.debug || options.config?.debug) {
      logger.setLevel(LogLevel.DEBUG);
      logger.info('🐛 Debug mode enabled - Verbose logging active');
    }

    logger.info('🚀 Initializing CoreSDK...', { 
      environmentEndpoint: options.environmentEndpoint,
      appKey: options.appKey,
    });

    this.options = options;

    // Extract base URL from environment endpoint for initial config
    const envUrl = new URL(options.environmentEndpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const initialBaseUrl = envUrl.origin + envUrl.pathname.split('/').slice(0, -5).join('/'); // Remove last 5 path segments

    // Initialize config with temporary baseUrl (will be updated after environment fetch)
    this.config = new ConfigManager({
      ...options,
      config: {
        apiBaseUrl: initialBaseUrl,
        ...options.config,
      },
    });

    // Initialize state
    this.state = new StateStore({
      persistence: {
        enabled: this.config.isFeatureEnabled('enableStatePersistence'),
        storage: this.config.getConfig().auth?.storage || 'localStorage',
      },
    });

    // Initialize API client
    this.api = new ApiClient(this.config);

    // Initialize auth manager
    this.auth = new AuthManager(
      this.api,
      this.state,
      this.config.getConfig().auth
    );

    // Initialize WebSocket if enabled
    if (this.config.isFeatureEnabled('enableWebSocket') && this.config.getWsBaseUrl()) {
      this.websocket = new WebSocketClient({
        url: this.config.getWsBaseUrl()!,
        reconnect: {
          enabled: true,
          maxAttempts: 5,
          delay: 1000,
        },
      });
    }

    // Initialize feature manager
    this.feature = new FeatureManager(this.api, this.state);

    // Initialize router manager
    this.router = new RouterManager(this.api, this.state);

    // Initialize workflow manager
    this.workflow = new WorkflowManager(
      this.api,
      this.state,
      this.websocket
    );

    // Initialize view manager
    this.view = new ViewManager(this.api, this.state);
  }

  /**
   * Initialize SDK (load environment, client config, features, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('SDK already initialized, skipping...');
      return;
    }

    logger.group('📦 SDK Initialization');
    
    try {
      // Step 1: Fetch environments
      logger.info('Step 1/7: Fetching environments...', { endpoint: this.options.environmentEndpoint });
      const environments = await this.fetchEnvironments();
      logger.debug('Environments fetched:', environments);
      
      // Step 2: Select stage
      logger.info('Step 2/7: Selecting stage...');
      const selectedStage = this.selectStage(environments);
      logger.info('Stage selected:', { 
        id: selectedStage.id, 
        name: selectedStage.name,
        baseUrl: selectedStage.baseUrl,
      });
      
      // Step 3: Update config with selected stage baseUrl
      logger.info('Step 3/7: Updating config with stage baseUrl...');
      this.config.updateConfig({
        apiBaseUrl: selectedStage.baseUrl,
        wsBaseUrl: selectedStage.wsUrl,
      });
      logger.debug('Config updated:', {
        apiBaseUrl: selectedStage.baseUrl,
        wsBaseUrl: selectedStage.wsUrl,
      });
      
      // Step 4: Fetch client config
      logger.info('Step 4/7: Fetching client config...');
      const clientConfig = await this.fetchClientConfig(selectedStage.baseUrl);
      logger.debug('Client config fetched:', clientConfig);
      
      // Step 5: Merge client config into SDK config
      logger.info('Step 5/7: Merging client config...');
      this.mergeClientConfig(clientConfig);
      logger.debug('Client config merged');
      
      // Step 6: Initialize features
      logger.info('Step 6/7: Initializing features...');
      await this.feature.initialize();
      logger.info('Features initialized');
      
      // Step 7: Connect WebSocket if enabled
      if (this.websocket) {
        logger.info('Step 7/7: Connecting WebSocket...');
        await this.websocket.connect();
        logger.info('WebSocket connected');
      } else {
        logger.info('Step 7/7: WebSocket disabled, skipping...');
      }

      this.initialized = true;
      logger.info('✅ SDK initialization completed successfully!');
      logger.groupEnd();
    } catch (error) {
      logger.error('❌ Failed to initialize VNextSDK:', error);
      logger.groupEnd();
      throw error;
    }
  }

  /**
   * Fetch environments from endpoint
   */
  private async fetchEnvironments(): Promise<any> {
    logger.debug('Fetching environments from:', this.options.environmentEndpoint);
    const response = await fetch(this.options.environmentEndpoint);
    
    if (!response.ok) {
      logger.error('Failed to fetch environments:', { 
        status: response.status, 
        statusText: response.statusText 
      });
      throw new Error(`Failed to fetch environments: ${response.statusText}`);
    }
    
    const data = await response.json();
    logger.debug('Environments response:', { 
      status: response.status,
      multiStageMode: data.multiStageMode,
      defaultStage: data.defaultStage,
      stagesCount: data.stages?.length,
    });
    
    return data;
  }

  /**
   * Select stage from environments
   */
  private selectStage(environments: any): any {
    const stageId = this.options.defaultStage || environments.defaultStage || 'prod';
    logger.debug('Selecting stage:', { requested: stageId, available: environments.stages?.map((s: any) => s.id) });
    
    const stage = environments.stages?.find((s: any) => s.id === stageId);
    
    if (!stage) {
      logger.error('Stage not found:', { 
        requested: stageId, 
        available: environments.stages?.map((s: any) => s.id) 
      });
      throw new Error(`Stage '${stageId}' not found in environments`);
    }
    
    return stage;
  }

  /**
   * Fetch client config from endpoint
   */
  private async fetchClientConfig(baseUrl: string): Promise<any> {
    // Build URL: if baseUrl ends with /v1, remove it and add /api/v1, otherwise add /api/v1
    // This handles both localhost:3001 and https://pilot-api.example.com/v1 cases
    const normalizedBaseUrl = baseUrl.endsWith('/v1') ? baseUrl.replace(/\/v1$/, '') : baseUrl;
    const clientConfigUrl = `${normalizedBaseUrl}/api/v1/morph-idm/workflows/client/instances/${this.options.appKey}/functions/client`;
    logger.debug('Fetching client config from:', clientConfigUrl);
    
    const response = await fetch(clientConfigUrl);
    
    if (!response.ok) {
      logger.error('Failed to fetch client config:', { 
        status: response.status, 
        statusText: response.statusText,
        url: clientConfigUrl,
      });
      throw new Error(`Failed to fetch client config: ${response.statusText}`);
    }
    
    const data = await response.json();
    logger.debug('Client config response:', { 
      status: response.status,
      version: data.version,
      theme: data.theme,
    });
    
    return data;
  }

  /**
   * Merge client config into SDK config
   */
  private mergeClientConfig(clientConfig: any): void {
    logger.debug('Merging client config...', { config: clientConfig });
    
    // Extract relevant config from client config
    const configUpdates: Partial<SdkConfig> = {};
    
    if (clientConfig.api?.timeout) {
      configUpdates.timeout = clientConfig.api.timeout;
      logger.debug('Config update: timeout', clientConfig.api.timeout);
    }
    
    if (clientConfig.realtime?.websocket?.enabled) {
      configUpdates.features = {
        ...configUpdates.features,
        enableWebSocket: true,
      };
      logger.debug('Config update: WebSocket enabled');
    }
    
    // Update config
    this.config.updateConfig(configUpdates);
    
    // Store client config in state for later use
    this.state.set('client.config', clientConfig);
    logger.debug('Client config stored in state');
  }

  /**
   * Cleanup SDK
   */
  async cleanup(): Promise<void> {
    if (this.websocket) {
      this.websocket.disconnect();
    }
  }
}

// Default export
export default VNextSDK;

