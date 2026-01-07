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

  constructor(options?: ClientOptions) {
    // Initialize config
    this.config = new ConfigManager(options);

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
   * Initialize SDK (load features, etc.)
   */
  async initialize(): Promise<void> {
    await this.feature.initialize();
    
    if (this.websocket) {
      await this.websocket.connect();
    }
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

