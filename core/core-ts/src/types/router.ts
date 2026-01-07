/**
 * Router Manager Types
 */

export type InterfaceMode = 'mdi' | 'sdi';

export interface Route {
  path: string;
  name?: string;
  component?: string;
  view?: string;
  params?: Record<string, any>;
  query?: Record<string, any>;
  meta?: RouteMeta;
}

export interface RouteMeta {
  title?: string;
  requiresAuth?: boolean;
  roles?: string[];
  permissions?: string[];
  keepAlive?: boolean;
  layout?: string;
}

export interface NavigationOptions {
  replace?: boolean;
  state?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
}

export interface BannerConfig {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  title?: string;
  duration?: number;
  actions?: BannerAction[];
  persistent?: boolean;
}

export interface BannerAction {
  label: string;
  action: () => void | Promise<void>;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface RouterManager {
  navigate(route: Route | string, options?: NavigationOptions): Promise<void>;
  goBack(): void;
  goForward(): void;
  replace(route: Route | string, options?: NavigationOptions): Promise<void>;
  getCurrentRoute(): Route | undefined;
  getHistory(): Route[];
  setMode(mode: InterfaceMode): void;
  getMode(): InterfaceMode;
  showBanner(banner: BannerConfig): void;
  hideBanner(id: string): void;
  clearBanners(): void;
  onRouteChange(callback: (route: Route) => void): () => void;
}

