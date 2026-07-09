/**
 * `useWorkflow(options)` — Vue 3 reactive bridge around `WorkflowManager`.
 *
 * The composable subscribes to the relevant `WorkflowManager` events and
 * mirrors the cached state through `ref` / `computed`. It cleans up
 * automatically when the calling effect scope is disposed (typical Vue
 * component unmount); callers that need a longer lifetime can call
 * `attach()` / `detach()` manually.
 *
 * The composable does NOT own the `WorkflowManager`; the host app provides
 * one (usually a singleton wired with `provide('workflowManager', wm)`).
 */

import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  triggerRef,
  type Ref,
} from 'vue';
import type {
  ContinueWorkflowResult,
  NavigationRequest,
  RetryWorkflowResult,
  StartTransitionResult,
  StartWorkflowResult,
  Subscription,
  TransitionErrorEvent,
  VNextState,
  WorkflowEventMap,
} from 'amorphie-workflow-manager';
import type {
  ScopedContinueInput,
  ScopedRetryInput,
  ScopedStartInput,
  ScopedTransitionInput,
  UseWorkflowOptions,
  UseWorkflowReturn,
} from './types.js';

const TERMINAL_STATUSES = new Set(['completed', 'faulted']);

export function useWorkflow(options: UseWorkflowOptions): UseWorkflowReturn {
  const { manager, domain, name } = options;

  // ---- reactive backing store ---------------------------------------------
  // We keep the SDK state in a `shallowRef` and re-trigger on every assignment;
  // the cached object is replaced wholesale by the SDK so deep reactivity is
  // unnecessary and would fight with frozen-by-default DTOs.
  const stateRef = shallowRef<VNextState | null>(null);
  const loading = ref(false);
  const error = ref<TransitionErrorEvent | null>(null);
  const navigation = ref<NavigationRequest | null>(null);

  // ---- derived computeds ---------------------------------------------------
  const state = computed(() => stateRef.value);
  const status = computed(() => stateRef.value?.status);
  const currentState = computed(() => stateRef.value?.currentState);
  const view = computed(() => stateRef.value?.view ?? null);
  const data = computed(() => stateRef.value?.data?.data ?? null);
  const transitions = computed(() => stateRef.value?.transitions ?? []);
  const ready = computed(() => stateRef.value !== null);
  const isTerminal = computed(() => {
    const s = stateRef.value?.status;
    return s !== undefined && TERMINAL_STATUSES.has(s);
  });

  // ---- subscription bookkeeping --------------------------------------------
  let attached = false;
  const subs: Subscription[] = [];

  function syncFromCache(): void {
    const next = manager.getStateByWorkflowName(name);
    if (next !== stateRef.value) {
      stateRef.value = next;
    } else if (next) {
      // SDK mutates the same object reference on patch, force re-render
      triggerRef(stateRef);
    }
  }

  function attach(): void {
    if (attached) return;
    attached = true;

    subs.push(
      manager.on('stateChanged', (e) => {
        if (e.workflowName !== name) return;
        syncFromCache();
      }),
      manager.on('loadingChanged', (e) => {
        loading.value = e.displayLoading;
      }),
      manager.on('transitionError', (e) => {
        error.value = e;
      }),
      manager.on('navigationRequested', (e) => {
        if (e.pageContext.workflowName !== name) return;
        navigation.value = e;
      }),
      manager.on('pollingStopped', (e) => {
        if (e.workflowName !== name) return;
        // Reflect terminal status (completed/faulted/timeout/terminated) in cache.
        syncFromCache();
      }),
    );

    // initial sync — covers the case where the workflow was started before
    // the composable mounted.
    syncFromCache();
  }

  function detach(): void {
    if (!attached) return;
    attached = false;
    while (subs.length > 0) {
      subs.pop()?.unsubscribe();
    }
  }

  // Auto-cleanup on component unmount (or any explicit effect scope dispose).
  if (getCurrentScope()) {
    onScopeDispose(detach);
  }
  attach();

  // ---- actions -------------------------------------------------------------

  function clearError(): void {
    error.value = null;
  }

  async function start(input?: ScopedStartInput): Promise<StartWorkflowResult> {
    clearError();
    const merged = { ...(options.autoStartInput ?? {}), ...(input ?? {}), domain, name };
    const result = await manager.startWorkflow(merged);
    syncFromCache();
    return result;
  }

  async function transitionAction(input: ScopedTransitionInput): Promise<StartTransitionResult> {
    clearError();
    const result = await manager.startTransition({ ...input, domain, name });
    syncFromCache();
    return result;
  }

  async function confirm(input: {
    transitionKey: string;
    additionalData?: Record<string, unknown>;
  }): Promise<StartTransitionResult> {
    clearError();
    const result = await manager.startAwaitingTransition(input);
    syncFromCache();
    return result;
  }

  function cancelAwaiting(transitionKey?: string): void {
    manager.cancelAwaitingTransition(transitionKey ? { transitionKey } : undefined);
  }

  async function retry(
    input?: Partial<ScopedRetryInput> & { instanceId?: string },
  ): Promise<RetryWorkflowResult> {
    clearError();
    const instanceId = input?.instanceId ?? stateRef.value?.instanceId;
    if (!instanceId) {
      const err: RetryWorkflowResult = {
        ok: false,
        error: { code: 'invalid_input', message: 'No instanceId available for retry' },
      };
      return err;
    }
    const result = await manager.retryWorkflow({
      ...(input ?? {}),
      domain,
      name,
      instanceId,
    });
    syncFromCache();
    return result;
  }

  async function continueWith(input: ScopedContinueInput): Promise<ContinueWorkflowResult> {
    clearError();
    const result = await manager.continueWorkflow({ ...input, domain, name });
    syncFromCache();
    return result;
  }

  function terminate(): void {
    manager.terminateWorkflow({ workflowName: name });
    syncFromCache();
  }

  // ---- escape hatch --------------------------------------------------------
  function on<K extends keyof WorkflowEventMap>(
    event: K,
    handler: (payload: WorkflowEventMap[K]) => void,
  ): () => void {
    const sub = manager.on(event, handler);
    return () => sub.unsubscribe();
  }

  // ---- auto-start ----------------------------------------------------------
  if (options.autoStart) {
    void start(options.autoStartInput);
  }

  return {
    state,
    status,
    currentState,
    view,
    data,
    transitions,
    loading: loading as Ref<boolean>,
    error: error as Ref<TransitionErrorEvent | null>,
    navigation: navigation as Ref<NavigationRequest | null>,
    ready,
    isTerminal,
    start,
    transition: transitionAction,
    confirm,
    cancelAwaiting,
    retry,
    continueWith,
    terminate,
    attach,
    detach,
    on,
  };
}
