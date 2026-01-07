/**
 * One Factor Authentication
 */

import type {
  OneFactorAuthCredentials,
  AuthResult,
  AuthStep,
} from '../types/auth';
import type { ApiClient } from '../api';

export class OneFactorAuth {
  constructor(private apiClient: ApiClient) {}

  /**
   * Authenticate with username and password
   */
  async authenticate(credentials: OneFactorAuthCredentials): Promise<AuthResult> {
    try {
      const response = await this.apiClient.post<{
        token?: any;
        requiresUpgrade?: boolean;
        nextStep?: AuthStep;
        requires2FA?: boolean;
      }>('/auth/1fa', credentials);

      if (response.data.token) {
        return {
          success: true,
          authType: '1fa',
          token: response.data.token,
          requiresUpgrade: response.data.requiresUpgrade || false,
        };
      }

      if (response.data.requires2FA) {
        return {
          success: false,
          authType: '1fa',
          requiresUpgrade: true,
          nextStep: response.data.nextStep,
        };
      }

      if (response.data.nextStep) {
        return {
          success: false,
          authType: '1fa',
          nextStep: response.data.nextStep,
        };
      }

      return {
        success: false,
        authType: '1fa',
        error: 'Authentication failed',
      };
    } catch (error: any) {
      return {
        success: false,
        authType: '1fa',
        error: error.message || 'One factor authentication failed',
      };
    }
  }
}

