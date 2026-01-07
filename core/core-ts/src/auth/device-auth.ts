/**
 * Device Authentication
 */

import type {
  DeviceAuthCredentials,
  AuthResult,
  AuthType,
} from '../types/auth';
import type { ApiClient } from '../api';

export class DeviceAuth {
  constructor(private apiClient: ApiClient) {}

  /**
   * Authenticate with device credentials
   */
  async authenticate(credentials: DeviceAuthCredentials): Promise<AuthResult> {
    try {
      const response = await this.apiClient.post<{ token: any; requiresUpgrade?: boolean }>(
        '/auth/device',
        credentials
      );

      if (response.data.token) {
        return {
          success: true,
          authType: 'device',
          token: response.data.token,
          requiresUpgrade: response.data.requiresUpgrade || false,
        };
      }

      return {
        success: false,
        authType: 'device',
        error: 'Authentication failed',
      };
    } catch (error: any) {
      return {
        success: false,
        authType: 'device',
        error: error.message || 'Device authentication failed',
      };
    }
  }
}

