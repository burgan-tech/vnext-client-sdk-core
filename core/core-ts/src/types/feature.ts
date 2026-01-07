/**
 * Feature Manager Types
 */

export interface FeatureConfig {
  id: string;
  name: string;
  enabled: boolean;
  modules?: string[];
  menu?: MenuConfig;
  permissions?: string[];
}

export interface MenuConfig {
  items: MenuItem[];
  layout?: 'horizontal' | 'vertical' | 'sidebar';
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  action?: MenuAction;
  children?: MenuItem[];
  visible?: boolean;
  enabled?: boolean;
  order?: number;
  badge?: string | number;
}

export interface MenuAction {
  type: 'route' | 'workflow' | 'view' | 'custom';
  target?: string;
  params?: Record<string, any>;
  handler?: () => void | Promise<void>;
}

export interface FeatureManager {
  initialize(): Promise<void>;
  getFeature(id: string): FeatureConfig | undefined;
  isFeatureEnabled(id: string): boolean;
  getMenu(): MenuConfig | undefined;
  executeAction(action: MenuAction): Promise<void>;
  onFeatureChange(callback: (feature: FeatureConfig) => void): () => void;
}

