/**
 * API Interceptors
 */

import type { ApiRequestConfig, ApiResponse, ApiError, ApiInterceptor } from '../types/api';

export class InterceptorManager {
  private requestInterceptors: Array<(config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig>> = [];
  private responseInterceptors: Array<(response: ApiResponse<any>) => ApiResponse<any> | Promise<ApiResponse<any>>> = [];
  private errorInterceptors: Array<(error: ApiError) => ApiError | Promise<ApiError>> = [];

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig>): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor<T = any>(interceptor: (response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>): () => void {
    this.responseInterceptors.push(interceptor as (response: ApiResponse<any>) => ApiResponse<any> | Promise<ApiResponse<any>>);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor as any);
      if (index > -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor: (error: ApiError) => ApiError | Promise<ApiError>): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Execute request interceptors
   */
  async executeRequestInterceptors(config: ApiRequestConfig): Promise<ApiRequestConfig> {
    let result = config;
    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Execute response interceptors
   */
  async executeResponseInterceptors<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Execute error interceptors
   */
  async executeErrorInterceptors(error: ApiError): Promise<ApiError> {
    let result = error;
    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }
}

