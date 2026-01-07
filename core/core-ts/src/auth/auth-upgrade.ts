/**
 * Authentication Upgrade
 */

import type {
  AuthUpgradeRequest,
  AuthType,
  AuthResult,
} from '../types/auth';
import type { ApiClient } from '../api';

export class AuthUpgrade {
  constructor(private apiClient: ApiClient) {}

  /**
   * Upgrade authentication type
   */
  async upgrade(request: AuthUpgradeRequest): Promise<AuthResult> {
    try {
      const response = await this.apiClient.post<{
        token?: any;
        nextStep?: any;
      }>('/auth/upgrade', request);

      if (response.data.token) {
        return {
          success: true,
          authType: request.to,
          token: response.data.token,
        };
      }

      if (response.data.nextStep) {
        return {
          success: false,
          authType: request.from,
          nextStep: response.data.nextStep,
        };
      }

      return {
        success: false,
        authType: request.from,
        error: 'Upgrade failed',
      };
    } catch (error: any) {
      return {
        success: false,
        authType: request.from,
        error: error.message || 'Authentication upgrade failed',
      };
    }
  }

  /**
   * Check if upgrade is available
   */
  async canUpgrade(from: AuthType, to: AuthType): Promise<boolean> {
    try {
      const response = await this.apiClient.get<{ canUpgrade: boolean }>(
        `/auth/upgrade/check?from=${from}&to=${to}`
      );
      return response.data.canUpgrade || false;
    } catch {
      return false;
    }
  }
}

