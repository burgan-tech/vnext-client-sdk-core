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
      
      // Step 2: Select stage (check multiStageMode)
      logger.info('Step 2/7: Selecting stage...', { multiStageMode: environments.multiStageMode });
      const selectedStage = await this.selectStage(environments);
      logger.info('Stage selected:', { 
        key: selectedStage.key, 
        title: selectedStage.title,
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
      const clientConfig = await this.fetchClientConfig(selectedStage);
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
   * Handles multiStageMode: never, onStartup, onProfile
   */
  private async selectStage(environments: any): Promise<any> {
    const multiStageMode = environments.multiStageMode || 'never';
      logger.debug('Selecting stage:', { 
      multiStageMode,
      requested: this.options.defaultStage,
      default: environments.defaultStage,
      available: environments.stages?.map((s: any) => s.key || s.id) 
    });

    let stageId: string | undefined;

    // Handle different multiStageMode values
    if (multiStageMode === 'onStartup') {
      // Check if backend-driven workflow is provided (support both 'selector-workflow' and 'workflow' keys)
      const workflow = environments['selector-workflow'] || environments.workflow;
      if (workflow?.baseUrl && workflow?.domain && workflow?.workflow) {
        // Use backend-driven workflow for stage selection
        logger.info('onStartup mode: Using backend-driven workflow for stage selection...', {
          workflowDomain: workflow.domain,
          workflowName: workflow.workflow,
          workflowVersion: workflow.version,
          baseUrl: workflow.baseUrl,
        });
        try {
          stageId = await this.selectStageViaWorkflow(workflow, environments.stages);
          logger.info('Stage selected via workflow:', stageId);
        } catch (error) {
          logger.warn('Workflow-based stage selection failed, falling back to callback or default:', error);
          // Fall through to callback or default - stageId remains undefined
        }
      }
      
      // If workflow didn't provide stageId, try callback or default
      if (!stageId) {
        if (this.options.onStageSelection) {
          // Fallback to callback-based dialog
          logger.info('onStartup mode: Requesting stage selection from user via callback...');
          const stages = environments.stages?.map((s: any) => ({ 
            id: s.key || s.id, // Support both key and id for backward compatibility
            name: s.title || s.name // Support both title and name for backward compatibility
          })) || [];
          stageId = await this.options.onStageSelection(stages);
          logger.info('User selected stage:', stageId);
        } else {
          // No workflow success and no callback, use default
          logger.warn('onStartup mode: No workflow result and no callback provided, using default stage');
          stageId = this.options.defaultStage || environments.defaultStage || 'prod';
        }
      }
      
      // Ensure stageId is set (fallback safety)
      if (!stageId) {
        logger.warn('onStartup mode: stageId still undefined after all attempts, using defaultStage');
        stageId = environments.defaultStage || 'prod';
      }
    } else if (multiStageMode === 'never' || multiStageMode === 'onProfile') {
      // Use default stage (never: always default, onProfile: start with default, can change later)
      stageId = this.options.defaultStage || environments.defaultStage || 'prod';
      logger.info('Using default stage:', stageId);
    } else {
      // Fallback to default
      stageId = this.options.defaultStage || environments.defaultStage || 'prod';
      logger.warn('Unknown multiStageMode, using default:', { multiStageMode, stageId });
    }
    
    // Support both 'key' and 'id' for backward compatibility
    logger.debug('Looking for stage:', { 
      stageId,
      stageIdType: typeof stageId,
      stagesCount: environments.stages?.length,
      stages: environments.stages?.map((s: any) => ({ 
        key: s.key, 
        id: s.id, 
        identifier: s.key || s.id,
        match: (s.key || s.id) === stageId
      }))
    });
    
    // Try to find stage by key first, then by id
    const stage = environments.stages?.find((s: any) => {
      const identifier = s.key || s.id;
      const match = identifier === stageId;
      if (match) {
        logger.debug('Stage match found:', { identifier, stageId, key: s.key, id: s.id });
      }
      return match;
    });
    
    if (!stage) {
      const available = environments.stages?.map((s: any) => s.key || s.id) || [];
      logger.error('Stage not found:', { 
        requested: stageId,
        requestedType: typeof stageId,
        available,
        availableTypes: environments.stages?.map((s: any) => ({
          key: s.key,
          keyType: typeof s.key,
          id: s.id,
          idType: typeof s.id,
          identifier: s.key || s.id,
          identifierType: typeof (s.key || s.id)
        })),
        stagesDetails: environments.stages?.map((s: any) => ({
          key: s.key,
          id: s.id,
          title: s.title,
          name: s.name
        }))
      });
      throw new Error(`Stage '${stageId}' not found in environments. Available: ${available.join(', ')}`);
    }
    
    return stage;
  }

  /**
   * Select stage via backend-driven workflow
   * The workflow will handle the UI and return the selected stage ID
   * 
   * URL pattern: {baseUrl}/api/v1/{domain}/workflows/{workflow}/instances/start
   */
  private async selectStageViaWorkflow(
    workflow: { baseUrl: string; domain: string; workflow: string; version: string; runtime?: string },
    availableStages: Array<{ key?: string; id?: string; title?: string; name?: string }>
  ): Promise<string> {
    // Build workflow start URL according to Swagger pattern
    // Pattern: /api/v1/{domain}/workflows/{workflow}/instances/start
    // baseUrl may already include /api/v1/, so we need to handle both cases
    let baseUrl = workflow.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // If baseUrl already includes /api/v1/, use it as is, otherwise add it
    if (!baseUrl.includes('/api/v1')) {
      baseUrl = `${baseUrl}/api/v1`;
    }
    
    const workflowEndpoint = `${baseUrl}/${workflow.domain}/workflows/${workflow.workflow}/instances/start`;
    
    logger.debug('Starting stage selection workflow...', { 
      workflowEndpoint,
      domain: workflow.domain,
      workflow: workflow.workflow,
      version: workflow.version,
      availableStages: availableStages.map(s => s.key || s.id),
    });

    try {
      // Build URL with version as query parameter (according to Swagger)
      const url = new URL(workflowEndpoint);
      if (workflow.version) {
        url.searchParams.set('version', workflow.version);
      }
      
      // Start workflow instance
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attributes: {
            availableStages,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start stage selection workflow: ${response.statusText}`);
      }

      const workflowInstance = await response.json();
      logger.debug('Workflow instance started:', { 
        instanceId: workflowInstance.id,
        state: workflowInstance.status?.code,
      });

      // If workflow has onStageSelection callback, use it to handle workflow UI
      // The callback should render the workflow and return the selected stage ID
      if (this.options.onStageSelection) {
        // Pass workflow instance to callback
        // The callback should handle workflow rendering and return selected stage
        const stages = availableStages.map(s => ({ 
          id: (s.key || s.id || 'unknown') as string, // Support both key and id
          name: (s.title || s.name || 'Unknown') as string // Support both title and name
        }));
        const selectedStageId = await this.options.onStageSelection(stages, workflowInstance);
        return selectedStageId;
      } else {
        // No callback provided, workflow should be handled externally
        // For now, wait for workflow completion and extract stage from result
        // This is a simplified implementation - in real scenario, workflow manager would handle this
        throw new Error('Workflow-based stage selection requires onStageSelection callback to handle workflow UI');
      }
    } catch (error) {
      logger.error('Failed to select stage via workflow:', error);
      throw error;
    }
  }

  /**
   * Fetch client config from endpoint
   * Uses stage.config object to build URL according to Swagger pattern
   */
  private async fetchClientConfig(stage: any): Promise<any> {
    // Build URL from stage.config object following Swagger pattern
    // Pattern: {baseUrl}/api/v1/{domain}/workflows/{workflow}/instances/{instanceKey}/functions/{function}
    let baseUrl = stage.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // If baseUrl already includes /api/v1/, use it as is, otherwise add it
    if (!baseUrl.includes('/api/v1')) {
      baseUrl = `${baseUrl}/api/v1`;
    }
    
    const config = stage.config || stage.configEndpoint;
    
    // Support both new config object and legacy configEndpoint string
    let clientConfigUrl: string;
    if (typeof config === 'string') {
      // Legacy: configEndpoint is a full URL string
      clientConfigUrl = config;
    } else if (config && config.domain && config.workflow && config.instanceKey && config.function) {
      // New: Build URL from config object
      clientConfigUrl = `${baseUrl}/${config.domain}/workflows/${config.workflow}/instances/${config.instanceKey}/functions/${config.function}`;
    } else {
      // Fallback: Use default pattern
      clientConfigUrl = `${baseUrl}/morph-idm/workflows/client/instances/${this.options.appKey}/functions/client`;
    }
    
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

