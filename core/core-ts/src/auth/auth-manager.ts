/**
 * Authentication Manager
 */

import type {
  AuthType,
  AuthStatus,
  AuthState,
  AuthToken,
  AuthResult,
  DeviceAuthCredentials,
  OneFactorAuthCredentials,
  TwoFactorAuthCredentials,
  AuthUpgradeRequest,
  UserInfo,
  AuthConfig,
} from '../types/auth';
import { DeviceAuth } from './device-auth';
import { OneFactorAuth } from './one-factor-auth';
import { TwoFactorAuth } from './two-factor-auth';
import { AuthUpgrade } from './auth-upgrade';
import { AuthStorage } from './storage';
import { EventEmitter } from '../state/event-emitter';
import type { ApiClient } from '../api';
import type { StateStore } from '../state';

export class AuthManager {
  private deviceAuth: DeviceAuth;
  private oneFactorAuth: OneFactorAuth;
  private twoFactorAuth: TwoFactorAuth;
  private authUpgrade: AuthUpgrade;
  private storage: AuthStorage;
  private eventEmitter: EventEmitter;
  private stateStore: StateStore;
  private apiClient: ApiClient;
  private config: AuthConfig;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    apiClient: ApiClient,
    stateStore: StateStore,
    config: AuthConfig = {}
  ) {
    this.apiClient = apiClient;
    this.stateStore = stateStore;
    this.config = config;
    this.deviceAuth = new DeviceAuth(apiClient);
    this.oneFactorAuth = new OneFactorAuth(apiClient);
    this.twoFactorAuth = new TwoFactorAuth(apiClient);
    this.authUpgrade = new AuthUpgrade(apiClient);
    this.storage = new AuthStorage(config);
    this.eventEmitter = new EventEmitter();

    // Restore token from storage
    this.restoreToken();

    // Setup auto-refresh if enabled
    if (config.autoRefresh !== false) {
      this.setupAutoRefresh();
    }
  }

  /**
   * Get current auth state
   */
  getState(): AuthState {
    const token = this.storage.getToken();
    const status: AuthStatus = token ? 'authenticated' : 'unauthenticated';

    return {
      status,
      authType: token ? this.getAuthType() : undefined,
      token: token || undefined,
      user: this.stateStore.get<UserInfo>('auth.user'),
    };
  }

  /**
   * Get current auth type
   */
  getAuthType(): AuthType | undefined {
    return this.stateStore.get<AuthType>('auth.type');
  }

  /**
   * Device authentication
   */
  async authenticateWithDevice(credentials: DeviceAuthCredentials): Promise<AuthResult> {
    const result = await this.deviceAuth.authenticate(credentials);
    await this.handleAuthResult(result);
    return result;
  }

  /**
   * One factor authentication
   */
  async authenticateWith1FA(credentials: OneFactorAuthCredentials): Promise<AuthResult> {
    const result = await this.oneFactorAuth.authenticate(credentials);
    await this.handleAuthResult(result);
    return result;
  }

  /**
   * Two factor authentication
   */
  async authenticateWith2FA(credentials: TwoFactorAuthCredentials): Promise<AuthResult> {
    const result = await this.twoFactorAuth.authenticate(credentials);
    await this.handleAuthResult(result);
    return result;
  }

  /**
   * Upgrade authentication
   */
  async upgradeAuth(request: AuthUpgradeRequest): Promise<AuthResult> {
    const result = await this.authUpgrade.upgrade(request);
    if (result.success && result.token) {
      await this.handleAuthResult(result);
    }
    return result;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await this.apiClient.post('/auth/logout');
    } catch {
      // Ignore errors
    } finally {
      this.clearAuth();
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(): Promise<boolean> {
    const token = this.storage.getToken();
    if (!token?.refreshToken) {
      return false;
    }

    try {
      const response = await this.apiClient.post<{ token: AuthToken }>(
        '/auth/refresh',
        { refreshToken: token.refreshToken }
      );

      if (response.data.token) {
        this.storage.saveToken(response.data.token);
        this.stateStore.set('auth.token', response.data.token);
        this.eventEmitter.emit('tokenRefreshed', response.data.token);
        return true;
      }

      return false;
    } catch {
      this.clearAuth();
      return false;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.storage.hasValidToken();
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    const token = this.storage.getToken();
    return token?.accessToken || null;
  }

  /**
   * Subscribe to auth state changes
   */
  onStateChange(callback: (state: AuthState) => void): () => void {
    return this.eventEmitter.on('stateChange', callback);
  }

  /**
   * Handle authentication result
   */
  private async handleAuthResult(result: AuthResult): Promise<void> {
    if (result.success && result.token) {
      this.storage.saveToken(result.token);
      this.stateStore.set('auth.token', result.token);
      this.stateStore.set('auth.type', result.authType);
      this.stateStore.set('auth.status', 'authenticated');

      // Fetch user info
      await this.fetchUserInfo();

      this.eventEmitter.emit('authenticated', result);
      this.eventEmitter.emit('stateChange', this.getState());

      // Setup auto-refresh
      this.setupAutoRefresh();
    } else {
      this.stateStore.set('auth.status', 'unauthenticated');
      this.eventEmitter.emit('authenticationFailed', result);
      this.eventEmitter.emit('stateChange', this.getState());
    }
  }

  /**
   * Fetch user info
   */
  private async fetchUserInfo(): Promise<void> {
    try {
      const response = await this.apiClient.get<UserInfo>('/auth/me');
      if (response.data) {
        this.stateStore.set('auth.user', response.data);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Clear authentication
   */
  private clearAuth(): void {
    this.storage.removeToken();
    this.stateStore.delete('auth.token');
    this.stateStore.delete('auth.type');
    this.stateStore.delete('auth.user');
    this.stateStore.set('auth.status', 'unauthenticated');
    this.stopAutoRefresh();
    this.eventEmitter.emit('loggedOut');
    this.eventEmitter.emit('stateChange', this.getState());
  }

  /**
   * Restore token from storage
   */
  private restoreToken(): void {
    const token = this.storage.getToken();
    if (token && this.storage.hasValidToken()) {
      this.stateStore.set('auth.token', token);
      this.stateStore.set('auth.status', 'authenticated');
      this.fetchUserInfo();
    }
  }

  /**
   * Setup auto-refresh
   */
  private setupAutoRefresh(): void {
    this.stopAutoRefresh();

    const token = this.storage.getToken();
    if (!token?.expiresAt) return;

    const threshold = this.config.tokenRefreshThreshold || 5 * 60 * 1000; // 5 minutes
    const timeUntilRefresh = token.expiresAt - Date.now() - threshold;

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshToken();
      }, timeUntilRefresh);
    } else {
      // Refresh immediately
      this.refreshToken();
    }
  }

  /**
   * Stop auto-refresh
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}

