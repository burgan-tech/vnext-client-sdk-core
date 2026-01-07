/**
 * Two Factor Authentication
 */

import type {
  TwoFactorAuthCredentials,
  AuthResult,
} from '../types/auth';
import type { ApiClient } from '../api';

export class TwoFactorAuth {
  constructor(private apiClient: ApiClient) {}

  /**
   * Authenticate with 2FA credentials
   */
  async authenticate(credentials: TwoFactorAuthCredentials): Promise<AuthResult> {
    try {
      const response = await this.apiClient.post<{ token: any }>(
        '/auth/2fa',
        credentials
      );

      if (response.data.token) {
        return {
          success: true,
          authType: '2fa',
          token: response.data.token,
        };
      }

      return {
        success: false,
        authType: '2fa',
        error: 'Authentication failed',
      };
    } catch (error: any) {
      return {
        success: false,
        authType: '2fa',
        error: error.message || 'Two factor authentication failed',
      };
    }
  }

  /**
   * Request 2FA code
   */
  async requestCode(method: 'sms' | 'email' | 'totp' | 'app', username: string): Promise<boolean> {
    try {
      await this.apiClient.post('/auth/2fa/request', { method, username });
      return true;
    } catch {
      return false;
    }
  }
}

