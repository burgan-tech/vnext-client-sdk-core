/**
 * Authentication Types
 */

export type AuthType = 'device' | '1fa' | '2fa';

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType?: string;
}

export interface DeviceAuthCredentials {
  deviceId: string;
  deviceInfo?: Record<string, any>;
}

export interface OneFactorAuthCredentials {
  username: string;
  password: string;
  deviceId?: string;
}

export interface TwoFactorAuthCredentials extends OneFactorAuthCredentials {
  code: string;
  method?: 'sms' | 'email' | 'totp' | 'app';
}

export interface AuthResult {
  success: boolean;
  authType: AuthType;
  token?: AuthToken;
  requiresUpgrade?: boolean;
  nextStep?: AuthStep;
  error?: string;
}

export interface AuthStep {
  type: 'question' | 'code' | 'password' | 'biometric';
  message?: string;
  field?: string;
  options?: string[];
}

export interface AuthUpgradeRequest {
  from: AuthType;
  to: AuthType;
  credentials: Partial<DeviceAuthCredentials | OneFactorAuthCredentials | TwoFactorAuthCredentials>;
  additionalData?: Record<string, any>;
}

export interface AuthState {
  status: AuthStatus;
  authType?: AuthType;
  token?: AuthToken;
  user?: UserInfo;
  requiresUpgrade?: boolean;
}

export interface UserInfo {
  id: string;
  username?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface AuthConfig {
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  tokenRefreshThreshold?: number; // milliseconds before expiry to refresh
  autoRefresh?: boolean;
}

