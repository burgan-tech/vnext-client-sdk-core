/**
 * Router Manager
 */

import type {
  Route,
  NavigationOptions,
  InterfaceMode,
  BannerConfig,
  RouterManager as IRouterManager,
} from '../types/router';
import type { ApiClient } from '../api';
import type { StateStore } from '../state';
import { EventEmitter } from '../state/event-emitter';

export class RouterManager implements IRouterManager {
  private currentRoute: Route | undefined;
  private history: Route[] = [];
  private mode: InterfaceMode = 'sdi';
  private banners: Map<string, BannerConfig> = new Map();
  private eventEmitter: EventEmitter;

  constructor(
    private apiClient: ApiClient,
    private stateStore: StateStore
  ) {
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Navigate to route
   */
  async navigate(route: Route | string, options?: NavigationOptions): Promise<void> {
    const targetRoute: Route = typeof route === 'string'
      ? { path: route }
      : route;

    // Merge options
    if (options) {
      targetRoute.params = { ...targetRoute.params, ...options.params };
      targetRoute.query = { ...targetRoute.query, ...options.query };
    }

    // Add to history if not replacing
    if (!options?.replace) {
      if (this.currentRoute) {
        this.history.push(this.currentRoute);
      }
    }

    this.currentRoute = targetRoute;
    this.stateStore.set('router.currentRoute', targetRoute);
    this.stateStore.set('router.history', this.history);

    this.eventEmitter.emit('routeChange', targetRoute);
  }

  /**
   * Go back in history
   */
  goBack(): void {
    if (this.history.length > 0) {
      const previousRoute = this.history.pop()!;
      this.currentRoute = previousRoute;
      this.stateStore.set('router.currentRoute', previousRoute);
      this.stateStore.set('router.history', this.history);
      this.eventEmitter.emit('routeChange', previousRoute);
    }
  }

  /**
   * Go forward in history
   */
  goForward(): void {
    // Forward navigation would require a forward stack
    // For now, this is a placeholder
    console.warn('Forward navigation not implemented');
  }

  /**
   * Replace current route
   */
  async replace(route: Route | string, options?: NavigationOptions): Promise<void> {
    await this.navigate(route, { ...options, replace: true });
  }

  /**
   * Get current route
   */
  getCurrentRoute(): Route | undefined {
    return this.currentRoute || this.stateStore.get<Route>('router.currentRoute');
  }

  /**
   * Get navigation history
   */
  getHistory(): Route[] {
    return this.history.length > 0 ? this.history : this.stateStore.get<Route[]>('router.history') || [];
  }

  /**
   * Set interface mode (MDI/SDI)
   */
  setMode(mode: InterfaceMode): void {
    this.mode = mode;
    this.stateStore.set('router.mode', mode);
    this.eventEmitter.emit('modeChange', mode);
  }

  /**
   * Get interface mode
   */
  getMode(): InterfaceMode {
    return this.mode || this.stateStore.get<InterfaceMode>('router.mode') || 'sdi';
  }

  /**
   * Show banner
   */
  showBanner(banner: BannerConfig): void {
    this.banners.set(banner.id, banner);
    this.stateStore.set(`router.banners.${banner.id}`, banner);

    this.eventEmitter.emit('bannerShow', banner);

    // Auto-hide if duration is set
    if (banner.duration && !banner.persistent) {
      setTimeout(() => {
        this.hideBanner(banner.id);
      }, banner.duration);
    }
  }

  /**
   * Hide banner
   */
  hideBanner(id: string): void {
    const banner = this.banners.get(id);
    if (banner) {
      this.banners.delete(id);
      this.stateStore.delete(`router.banners.${id}`);
      this.eventEmitter.emit('bannerHide', { id });
    }
  }

  /**
   * Clear all banners
   */
  clearBanners(): void {
    this.banners.forEach((_, id) => {
      this.stateStore.delete(`router.banners.${id}`);
    });
    this.banners.clear();
    this.eventEmitter.emit('bannersClear');
  }

  /**
   * Subscribe to route changes
   */
  onRouteChange(callback: (route: Route) => void): () => void {
    return this.eventEmitter.on('routeChange', callback);
  }
}

