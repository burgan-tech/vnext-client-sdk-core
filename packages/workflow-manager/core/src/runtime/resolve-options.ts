/**
 * Validate user-supplied `WorkflowManagerOptions` and fill in defaults.
 *
 * The returned `ResolvedOptions` is what every internal layer consumes; it
 * never has `undefined` for fields that have a sensible default.
 */

import type {
  HttpDelegate,
  LongPollingConfig,
  Timer,
  WorkflowConfig,
  WorkflowManagerOptions,
} from '../types.js';
import { defaultTimer } from '../utils/timer.js';

export const DEFAULT_LONG_POLLING_CONFIG: LongPollingConfig = {
  intervalSeconds: 4,
  durationSeconds: 60,
  timeoutSeconds: 30,
  useETag: true,
};

export const DEFAULT_VERSION = '1.0.0';
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface ResolvedOptions {
  http: HttpDelegate;
  platform?: 'web' | 'ios' | 'android';
  workflows: WorkflowConfig[];
  defaultLongPollingConfig: LongPollingConfig;
  defaultVersion: string;
  syncStart: boolean;
  syncTransition: boolean;
  syncRetry: boolean;
  extensions: string[];
  defaultRequestTimeoutMs: number;
  displayLoadingByDefault: boolean;
  timer: Timer;

  onLog: WorkflowManagerOptions['onLog'];
  onLoadingChanged: WorkflowManagerOptions['onLoadingChanged'];
  onNavigate: WorkflowManagerOptions['onNavigate'];
  onTransitionError: WorkflowManagerOptions['onTransitionError'];
  onTokenRefresh: WorkflowManagerOptions['onTokenRefresh'];
  launchUrl: WorkflowManagerOptions['launchUrl'];
  navigateDeepLink: WorkflowManagerOptions['navigateDeepLink'];

  parameterRegistry: WorkflowManagerOptions['parameterRegistry'];
  endpointResolver: WorkflowManagerOptions['endpointResolver'];
  dataLoader: WorkflowManagerOptions['dataLoader'];
  viewLoader: WorkflowManagerOptions['viewLoader'];
  schemaLoader: WorkflowManagerOptions['schemaLoader'];
  transitionBodyFilter: WorkflowManagerOptions['transitionBodyFilter'];
  viewHandlers: WorkflowManagerOptions['viewHandlers'];
}

export function resolveOptions(options: WorkflowManagerOptions): ResolvedOptions {
  if (!options || !options.http) {
    throw new Error('WorkflowManagerOptions.http is required');
  }

  const longPolling: LongPollingConfig = {
    ...DEFAULT_LONG_POLLING_CONFIG,
    ...(options.defaultLongPollingConfig ?? {}),
  };

  return {
    http: options.http,
    ...(options.platform !== undefined ? { platform: options.platform } : {}),
    workflows: options.workflows ?? [],
    defaultLongPollingConfig: longPolling,
    defaultVersion: options.defaultVersion ?? DEFAULT_VERSION,
    syncStart: options.syncStart ?? false,
    syncTransition: options.syncTransition ?? false,
    syncRetry: options.syncRetry ?? false,
    extensions: options.extensions ?? [],
    defaultRequestTimeoutMs: options.defaultRequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    displayLoadingByDefault: options.displayLoadingByDefault ?? true,
    timer: options.timer ?? defaultTimer,

    onLog: options.onLog,
    onLoadingChanged: options.onLoadingChanged,
    onNavigate: options.onNavigate,
    onTransitionError: options.onTransitionError,
    onTokenRefresh: options.onTokenRefresh,
    launchUrl: options.launchUrl,
    navigateDeepLink: options.navigateDeepLink,

    parameterRegistry: options.parameterRegistry,
    endpointResolver: options.endpointResolver,
    dataLoader: options.dataLoader,
    viewLoader: options.viewLoader,
    schemaLoader: options.schemaLoader,
    transitionBodyFilter: options.transitionBodyFilter,
    viewHandlers: options.viewHandlers,
  };
}

/**
 * Look up the `LongPollingConfig` to use for a given workflow name. Falls back
 * to the resolved default when no per-workflow override exists.
 */
export function pickLongPollingConfig(
  resolved: ResolvedOptions,
  workflowName: string,
): LongPollingConfig {
  const cfg = resolved.workflows.find((w) => w.name === workflowName);
  if (cfg?.longPollingConfig) {
    return { ...resolved.defaultLongPollingConfig, ...cfg.longPollingConfig };
  }
  return resolved.defaultLongPollingConfig;
}

/** Look up the canonical `WorkflowConfig` for a registered workflow. */
export function lookupWorkflowConfig(
  resolved: ResolvedOptions,
  input: { domain: string; name: string },
): WorkflowConfig | undefined {
  return resolved.workflows.find((w) => w.domain === input.domain && w.name === input.name);
}
