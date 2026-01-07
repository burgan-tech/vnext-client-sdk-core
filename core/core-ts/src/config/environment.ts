/**
 * Environment Detection and Configuration
 */

import type { Environment, EnvironmentConfig } from '../types/config';

const ENVIRONMENTS: Record<Environment, EnvironmentConfig> = {
  development: {
    apiBaseUrl: 'http://localhost:3000/api',
    wsBaseUrl: 'ws://localhost:3000',
    apiVersion: 'v1',
  },
  staging: {
    apiBaseUrl: 'https://staging-api.vnext.com/api',
    wsBaseUrl: 'wss://staging-api.vnext.com',
    apiVersion: 'v1',
  },
  production: {
    apiBaseUrl: 'https://api.vnext.com/api',
    wsBaseUrl: 'wss://api.vnext.com',
    apiVersion: 'v1',
  },
};

/**
 * Detect current environment
 */
export function detectEnvironment(): Environment {
  if (typeof window === 'undefined') {
    // Node.js environment
    return process.env.NODE_ENV === 'production' ? 'production' : 'development';
  }

  // Browser environment
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local')) {
    return 'development';
  }
  
  if (hostname.includes('staging') || hostname.includes('stg')) {
    return 'staging';
  }
  
  return 'production';
}

/**
 * Get environment configuration
 */
export function getEnvironmentConfig(environment?: Environment): EnvironmentConfig {
  const env = environment || detectEnvironment();
  return ENVIRONMENTS[env];
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined;
}

