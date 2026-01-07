/**
 * API Client
 */

import type {
  ApiRequestConfig,
  ApiResponse,
  ApiError,
  HttpMethod,
} from '../types/api';
import { InterceptorManager } from './interceptors';
import { shouldRetry, calculateRetryDelay, sleep } from './retry';
import type { ConfigManager } from '../config';

export class ApiClient {
  private configManager: ConfigManager;
  private interceptors: InterceptorManager;
  private defaultHeaders: Record<string, string>;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.interceptors = new InterceptorManager();
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get interceptor manager
   */
  getInterceptors(): InterceptorManager {
    return this.interceptors;
  }

  /**
   * Set default headers
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Make HTTP request
   */
  async request<T = any>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
    const method = config.method || 'GET';
    const url = this.buildUrl(config);
    
    let requestConfig: ApiRequestConfig = {
      ...config,
      method,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
    };

    // Execute request interceptors
    requestConfig = await this.interceptors.executeRequestInterceptors(requestConfig);

    const maxRetries = config.retry?.maxRetries || 0;
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(url, requestConfig);
        
        // Execute response interceptors
        const processedResponse = await this.interceptors.executeResponseInterceptors(response);
        
        return processedResponse;
      } catch (error: any) {
        lastError = this.normalizeError(error);
        
        // Check if should retry
        if (attempt < maxRetries && shouldRetry(lastError.code as any, attempt, config.retry)) {
          const delay = calculateRetryDelay(attempt, config.retry);
          await sleep(delay);
          continue;
        }

        // Execute error interceptors
        const processedError = await this.interceptors.executeErrorInterceptors(lastError);
        throw processedError;
      }
    }

    throw lastError || this.createError('Request failed', 500);
  }

  /**
   * Execute HTTP request
   */
  private async executeRequest<T>(
    url: string,
    config: ApiRequestConfig
  ): Promise<ApiResponse<T>> {
    const timeout = config.timeout || this.configManager.getConfig().timeout || 30000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: config.headers,
        body: config.data ? JSON.stringify(config.data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await this.parseResponse<T>(response);

      return {
        data,
        status: response.status,
        message: response.statusText,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw this.createError('Request timeout', 408);
      }
      
      throw error;
    }
  }

  /**
   * Parse response body
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    
    if (contentType?.includes('text/')) {
      return (await response.text()) as any;
    }
    
    return (await response.blob()) as any;
  }

  /**
   * Build full URL
   */
  private buildUrl(config: ApiRequestConfig): string {
    const baseUrl = this.configManager.getApiBaseUrl();
    let url = config.path || '';
    
    if (!url.startsWith('http')) {
      url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    // Add query parameters
    if (config.params) {
      const params = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `${url.includes('?') ? '&' : '?'}${queryString}`;
      }
    }

    return url;
  }

  /**
   * Normalize error
   */
  private normalizeError(error: any): ApiError {
    if (error.code && error.message) {
      return error as ApiError;
    }

    return this.createError(
      error.message || 'Unknown error',
      error.status || error.statusCode || 500
    );
  }

  /**
   * Create error object
   */
  private createError(message: string, code: number): ApiError {
    return {
      code: String(code),
      message,
    };
  }

  /**
   * GET request
   */
  get<T = any>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'path'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', path });
  }

  /**
   * POST request
   */
  post<T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', path, data });
  }

  /**
   * PUT request
   */
  put<T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', path, data });
  }

  /**
   * DELETE request
   */
  delete<T = any>(path: string, config?: Omit<ApiRequestConfig, 'method' | 'path'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', path });
  }

  /**
   * PATCH request
   */
  patch<T = any>(path: string, data?: any, config?: Omit<ApiRequestConfig, 'method' | 'path' | 'data'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', path, data });
  }
}

