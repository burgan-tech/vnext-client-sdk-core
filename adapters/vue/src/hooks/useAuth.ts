/**
 * useAuth Hook
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { AuthState, AuthType, DeviceAuthCredentials, OneFactorAuthCredentials, TwoFactorAuthCredentials, AuthUpgradeRequest } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useAuth() {
  const sdk = useVNextSDK();
  const state = ref<AuthState>(sdk.auth.getState());
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Watch for auth state changes
  const unsubscribe = sdk.auth.onStateChange((newState) => {
    state.value = newState;
  });

  onUnmounted(() => {
    unsubscribe();
  });

  const isAuthenticated = computed(() => sdk.auth.isAuthenticated());
  const authType = computed(() => state.value.authType);
  const user = computed(() => state.value.user);

  const loginWithDevice = async (credentials: DeviceAuthCredentials) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await sdk.auth.authenticateWithDevice(credentials);
      if (!result.success) {
        error.value = result.error || 'Device authentication failed';
      }
      return result;
    } catch (err: any) {
      error.value = err.message || 'Device authentication failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const loginWith1FA = async (credentials: OneFactorAuthCredentials) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await sdk.auth.authenticateWith1FA(credentials);
      if (!result.success) {
        error.value = result.error || '1FA authentication failed';
      }
      return result;
    } catch (err: any) {
      error.value = err.message || '1FA authentication failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const loginWith2FA = async (credentials: TwoFactorAuthCredentials) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await sdk.auth.authenticateWith2FA(credentials);
      if (!result.success) {
        error.value = result.error || '2FA authentication failed';
      }
      return result;
    } catch (err: any) {
      error.value = err.message || '2FA authentication failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const upgradeAuth = async (request: AuthUpgradeRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await sdk.auth.upgradeAuth(request);
      if (!result.success) {
        error.value = result.error || 'Auth upgrade failed';
      }
      return result;
    } catch (err: any) {
      error.value = err.message || 'Auth upgrade failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    loading.value = true;
    error.value = null;
    try {
      await sdk.auth.logout();
    } catch (err: any) {
      error.value = err.message || 'Logout failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    state,
    isAuthenticated,
    authType,
    user,
    loading,
    error,
    loginWithDevice,
    loginWith1FA,
    loginWith2FA,
    upgradeAuth,
    logout,
  };
}

