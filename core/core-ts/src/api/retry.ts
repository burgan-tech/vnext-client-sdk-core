/**
 * Retry Logic
 */

import type { RetryConfig } from '../types/api';

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Check if request should be retried
 */
export function shouldRetry(
  statusCode: number,
  attempt: number,
  config?: RetryConfig
): boolean {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  if (attempt >= retryConfig.maxRetries) {
    return false;
  }

  return retryConfig.retryableStatusCodes.includes(statusCode);
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
  attempt: number,
  config?: RetryConfig
): number {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const baseDelay = retryConfig.retryDelay || 1000;
  
  // Exponential backoff: delay * 2^attempt
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

