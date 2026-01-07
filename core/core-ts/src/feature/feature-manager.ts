/**
 * Feature Manager
 */

import type {
  FeatureConfig,
  MenuConfig,
  MenuItem,
  MenuAction,
  FeatureManager as IFeatureManager,
} from '../types/feature';
import type { ApiClient } from '../api';
import type { StateStore } from '../state';
import { EventEmitter } from '../state/event-emitter';

export class FeatureManager implements IFeatureManager {
  private features: Map<string, FeatureConfig> = new Map();
  private menuConfig: MenuConfig | undefined;
  private eventEmitter: EventEmitter;
  private initialized = false;

  constructor(
    private apiClient: ApiClient,
    private stateStore: StateStore
  ) {
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Initialize feature manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Fetch feature configuration from backend
      const response = await this.apiClient.get<{
        features: FeatureConfig[];
        menu?: MenuConfig;
      }>('/features');

      // Store features
      response.data.features.forEach(feature => {
        this.features.set(feature.id, feature);
        this.stateStore.set(`features.${feature.id}`, feature);
      });

      // Store menu config
      if (response.data.menu) {
        this.menuConfig = response.data.menu;
        this.stateStore.set('menu', this.menuConfig);
      }

      this.initialized = true;
      this.eventEmitter.emit('initialized', { features: Array.from(this.features.values()) });
    } catch (error) {
      console.error('Failed to initialize features:', error);
      throw error;
    }
  }

  /**
   * Get feature by ID
   */
  getFeature(id: string): FeatureConfig | undefined {
    return this.features.get(id) || this.stateStore.get<FeatureConfig>(`features.${id}`);
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(id: string): boolean {
    const feature = this.getFeature(id);
    return feature?.enabled || false;
  }

  /**
   * Get menu configuration
   */
  getMenu(): MenuConfig | undefined {
    return this.menuConfig || this.stateStore.get<MenuConfig>('menu');
  }

  /**
   * Execute menu action
   */
  async executeAction(action: MenuAction): Promise<void> {
    try {
      switch (action.type) {
        case 'route':
          // Route actions are handled by RouterManager
          this.eventEmitter.emit('routeAction', action);
          break;

        case 'workflow':
          // Workflow actions are handled by WorkflowManager
          this.eventEmitter.emit('workflowAction', action);
          break;

        case 'view':
          // View actions are handled by ViewManager
          this.eventEmitter.emit('viewAction', action);
          break;

        case 'custom':
          if (action.handler) {
            await action.handler();
          }
          break;

        default:
          console.warn('Unknown action type:', action.type);
      }
    } catch (error) {
      console.error('Failed to execute action:', error);
      throw error;
    }
  }

  /**
   * Subscribe to feature changes
   */
  onFeatureChange(callback: (feature: FeatureConfig) => void): () => void {
    return this.eventEmitter.on('featureChange', callback);
  }

  /**
   * Update feature configuration
   */
  updateFeature(feature: FeatureConfig): void {
    this.features.set(feature.id, feature);
    this.stateStore.set(`features.${feature.id}`, feature);
    this.eventEmitter.emit('featureChange', feature);
  }

  /**
   * Get all enabled features
   */
  getEnabledFeatures(): FeatureConfig[] {
    return Array.from(this.features.values()).filter(f => f.enabled);
  }
}

