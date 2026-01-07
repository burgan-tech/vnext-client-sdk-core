/**
 * Auth Token Storage
 */

import type { AuthToken, AuthConfig } from '../types/auth';
import { createStorageAdapter, type StorageAdapter } from '../state/storage';

const TOKEN_STORAGE_KEY = 'vnext-auth-token';

export class AuthStorage {
  private adapter: StorageAdapter;
  private config: AuthConfig;

  constructor(config: AuthConfig = {}) {
    this.config = config;
    this.adapter = createStorageAdapter(config.storage || 'localStorage');
  }

  /**
   * Save token
   */
  saveToken(token: AuthToken): void {
    this.adapter.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  }

  /**
   * Get token
   */
  getToken(): AuthToken | null {
    const stored = this.adapter.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    try {
      return JSON.parse(stored) as AuthToken;
    } catch {
      return null;
    }
  }

  /**
   * Remove token
   */
  removeToken(): void {
    this.adapter.removeItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Check if token exists and is valid
   */
  hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired
    if (token.expiresAt && token.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }
}

