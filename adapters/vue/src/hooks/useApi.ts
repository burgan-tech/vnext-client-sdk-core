/**
 * useApi Hook
 */

import { ref, type Ref } from 'vue';
import type { ApiRequestConfig, ApiResponse } from '@vnext/core-ts';
import { useVNextSDK } from '../composables';

export function useApi() {
  const sdk = useVNextSDK();
  const loading = ref(false);
  const error = ref<any>(null);

  const request = async <T = any>(config: ApiRequestConfig): Promise<ApiResponse<T>> => {
    loading.value = true;
    error.value = null;
    try {
      const response = await sdk.api.request<T>(config);
      return response;
    } catch (err: any) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const get = <T = any>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'path'>) => {
    return request<T>({ ...config, method: 'GET', path });
  };

  const post = <T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>) => {
    return request<T>({ ...config, method: 'POST', path, data });
  };

  const put = <T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>) => {
    return request<T>({ ...config, method: 'PUT', path, data });
  };

  const del = <T = any>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'path'>) => {
    return request<T>({ ...config, method: 'DELETE', path });
  };

  const patch = <T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>) => {
    return request<T>({ ...config, method: 'PATCH', path, data });
  };

  return {
    api: sdk.api,
    loading,
    error,
    request,
    get,
    post,
    put,
    delete: del,
    patch,
  };
}

