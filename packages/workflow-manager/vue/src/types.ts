/**
 * Vue-side public types for `useWorkflow`.
 *
 * The composable surfaces a reactive view of a single (workflowDomain, workflowName)
 * pair. Multiple `useWorkflow` calls in the same app keep their own reactive
 * state, but they all share the underlying `WorkflowManager` (and its caches).
 */

import type { ComputedRef, Ref } from 'vue';
import type {
  ContinueWorkflowInput,
  ContinueWorkflowResult,
  NavigationRequest,
  RetryWorkflowInput,
  RetryWorkflowResult,
  StartTransitionInput,
  StartTransitionResult,
  StartWorkflowInput,
  StartWorkflowResult,
  TransitionErrorEvent,
  VNextAvailableTransition,
  VNextInstanceStatus,
  VNextState,
  VNextStateSubType,
  VNextStateType,
  VNextView,
  WorkflowEventMap,
  WorkflowManager,
} from 'amorphie-workflow-manager';

/**
 * Lifecycle inputs scoped to a single workflow — `domain` / `name` are bound
 * by the composable, so callers don't repeat them on every action.
 */
export type ScopedStartInput = Omit<StartWorkflowInput, 'domain' | 'name'>;
export type ScopedTransitionInput = Omit<StartTransitionInput, 'domain' | 'name'>;
export type ScopedRetryInput = Omit<RetryWorkflowInput, 'domain' | 'name'>;
export type ScopedContinueInput = Omit<ContinueWorkflowInput, 'domain' | 'name'>;

/**
 * Subset of `WorkflowEventMap` that the composable exposes as one-off Vue
 * `Ref`s. The full event surface is still reachable via the underlying
 * manager (`options.manager.on(...)`); this is the curated convenience layer.
 */
export interface UseWorkflowOptions {
  /** Shared facade — usually one instance per app, provided via `provide/inject`. */
  manager: WorkflowManager;
  /** Workflow domain (backend `{domain}` slot). */
  domain: string;
  /** Workflow definition name (backend `{name}` slot). */
  name: string;
  /**
   * If true, `useWorkflow` automatically calls `start()` once on mount with
   * `autoStartInput`. Convenience for screens that always begin a flow.
   */
  autoStart?: boolean;
  autoStartInput?: ScopedStartInput;
  /**
   * Optional event prefix for log messages — useful when multiple composables
   * are active in the same component tree.
   */
  loggerLabel?: string;
}

/** State change event payload as exposed by Vue side (kept identical to facade). */
export type ScopedStateChangedEvent = {
  workflowName: string;
  instanceId: string;
  state: string;
  status: VNextInstanceStatus;
  stateType?: VNextStateType;
  stateSubType?: VNextStateSubType;
};

export interface UseWorkflowReturn {
  // ---- reactive state ---------------------------------------------------
  /** The full cached SDK state (or null when not yet initialised). */
  state: ComputedRef<VNextState | null>;
  /** Last observed status, derived from `state`. */
  status: ComputedRef<VNextInstanceStatus | undefined>;
  /** Current state name (or `undefined` when no state cached). */
  currentState: ComputedRef<string | undefined>;
  /** Active view (UI/action) carried by the current state. */
  view: ComputedRef<VNextView | null>;
  /** Cached data payload for the active instance. */
  data: ComputedRef<Record<string, unknown> | null>;
  /** Available transitions advertised by the runtime for the current state. */
  transitions: ComputedRef<VNextAvailableTransition[]>;

  /** Mirrors the SDK's `loadingChanged` event; toggled by lifecycle calls. */
  loading: Ref<boolean>;
  /** Last `transitionError` payload (cleared on the next successful action). */
  error: Ref<TransitionErrorEvent | null>;
  /** Last `navigationRequested` event — host can watch and route accordingly. */
  navigation: Ref<NavigationRequest | null>;

  /** True after `start`/`continue` populated cache; false otherwise. */
  ready: ComputedRef<boolean>;
  /** True for terminal states (`completed`/`faulted`). */
  isTerminal: ComputedRef<boolean>;

  // ---- actions ----------------------------------------------------------
  start(input?: ScopedStartInput): Promise<StartWorkflowResult>;
  transition(input: ScopedTransitionInput): Promise<StartTransitionResult>;
  /** Confirm a confirmation-pending transition (matches `startAwaitingTransition`). */
  confirm(input: { transitionKey: string; additionalData?: Record<string, unknown> }): Promise<StartTransitionResult>;
  cancelAwaiting(transitionKey?: string): void;
  retry(input?: Partial<ScopedRetryInput> & { instanceId?: string }): Promise<RetryWorkflowResult>;
  continueWith(input: ScopedContinueInput): Promise<ContinueWorkflowResult>;
  terminate(): void;

  // ---- lifecycle --------------------------------------------------------
  /** Manually attach the underlying manager event listeners (no-op if already wired). */
  attach(): void;
  /** Detach all listeners. Called automatically on `onScopeDispose`. */
  detach(): void;

  /** Subscribe to any raw `WorkflowManager` event (escape hatch). */
  on<K extends keyof WorkflowEventMap>(
    event: K,
    handler: (payload: WorkflowEventMap[K]) => void,
  ): () => void;
}
