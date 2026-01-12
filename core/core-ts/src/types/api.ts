/**
 * API Types
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequestConfig {
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  retry?: RetryConfig;
  path?: string;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  code?: number | string;
  status?: number;
  statusText?: string;
  data?: any;
  config?: ApiRequestConfig;
}

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatusCodes?: number[];
}

export type ApiInterceptor<T = any> = (value: T) => T | Promise<T>;
