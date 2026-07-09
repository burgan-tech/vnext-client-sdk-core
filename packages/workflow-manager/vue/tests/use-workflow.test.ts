/**
 * Unit tests for `useWorkflow` composable.
 *
 * The tests fake the `WorkflowManager` rather than spinning up the real one;
 * we only care that the composable wires events ↔ refs correctly and that
 * cleanup runs on scope dispose.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useWorkflow } from '../src/use-workflow.js';
import type { Subscription, VNextState, WorkflowEventMap } from 'amorphie-workflow-manager';

type EventHandler<K extends keyof WorkflowEventMap> = (payload: WorkflowEventMap[K]) => void;

class FakeManager {
  private readonly listeners = new Map<keyof WorkflowEventMap, Set<EventHandler<never>>>();
  private readonly states = new Map<string, VNextState>();

  on<K extends keyof WorkflowEventMap>(event: K, handler: EventHandler<K>): Subscription {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(handler as EventHandler<never>);
    return {
      unsubscribe: () => {
        bucket?.delete(handler as EventHandler<never>);
      },
    };
  }

  emit<K extends keyof WorkflowEventMap>(event: K, payload: WorkflowEventMap[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const handler of bucket) {
      (handler as EventHandler<K>)(payload);
    }
  }

  listenerCount(event: keyof WorkflowEventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  // Mocked SDK API surface (only what the composable touches)
  setCachedState(name: string, state: VNextState | null): void {
    if (state === null) this.states.delete(name);
    else this.states.set(name, state);
  }

  getStateByWorkflowName = vi.fn((name: string): VNextState | null => {
    return this.states.get(name) ?? null;
  });

  startWorkflow = vi.fn(async (input: { domain: string; name: string }) => {
    const state: VNextState = makeState(input.name, 'login', 'active');
    this.setCachedState(input.name, state);
    return { ok: true, instanceId: 'inst-1', statusCode: 201, status: 'active' as const };
  });

  startTransition = vi.fn(async (input: { name: string; transitionKey: string }) => {
    const next = makeState(input.name, 'otp', 'active');
    this.setCachedState(input.name, next);
    this.emit('stateChanged', {
      workflowName: input.name,
      instanceId: 'inst-1',
      state: 'otp',
      status: 'active',
    });
    return { ok: true, instanceId: 'inst-1', statusCode: 200, status: 'active' as const };
  });

  startAwaitingTransition = vi.fn(async () => {
    return { ok: true, instanceId: 'inst-1', statusCode: 200, status: 'active' as const };
  });

  cancelAwaitingTransition = vi.fn();

  retryWorkflow = vi.fn(async (input: { name: string; instanceId: string }) => {
    return { ok: true, instanceId: input.instanceId, statusCode: 200, status: 'active' as const };
  });

  continueWorkflow = vi.fn(async (input: { instanceId: string }) => {
    return { ok: true, instanceId: input.instanceId, statusCode: 200 };
  });

  terminateWorkflow = vi.fn((input: { workflowName: string }) => {
    this.setCachedState(input.workflowName, null);
  });
}

function makeState(name: string, currentState: string, status: VNextState['status']): VNextState {
  return {
    workflowName: name,
    domain: 'onboarding',
    instanceId: 'inst-1',
    currentState,
    status,
    data: { data: { foo: 'bar' }, extensions: {} },
    view: { pageId: currentState, content: {}, displayType: 'inline', viewType: 'json' },
    transitions: [],
    activeCorrelations: [],
  };
}

describe('useWorkflow', () => {
  let manager: FakeManager;
  beforeEach(() => {
    manager = new FakeManager();
  });

  it('returns null state until the manager populates the cache', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });
      expect(wf.state.value).toBeNull();
      expect(wf.status.value).toBeUndefined();
      expect(wf.ready.value).toBe(false);
      expect(wf.isTerminal.value).toBe(false);
      expect(wf.transitions.value).toEqual([]);
    });
    scope.stop();
  });

  it('mirrors stateChanged events into reactive refs', async () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.setCachedState('kyc', makeState('kyc', 'login', 'active'));
      manager.emit('stateChanged', {
        workflowName: 'kyc',
        instanceId: 'inst-1',
        state: 'login',
        status: 'active',
      });

      expect(wf.state.value?.currentState).toBe('login');
      expect(wf.status.value).toBe('active');
      expect(wf.currentState.value).toBe('login');
      expect(wf.view.value?.pageId).toBe('login');
      expect(wf.data.value).toEqual({ foo: 'bar' });
      expect(wf.ready.value).toBe(true);
      expect(wf.isTerminal.value).toBe(false);
    });
    scope.stop();
    await nextTick();
  });

  it('ignores stateChanged events for other workflows', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.setCachedState('kyc', makeState('kyc', 'login', 'active'));
      manager.emit('stateChanged', {
        workflowName: 'other-flow',
        instanceId: 'inst-99',
        state: 'whatever',
        status: 'active',
      });

      expect(wf.state.value).toBeNull();
      expect(manager.getStateByWorkflowName).not.toHaveBeenCalledWith('other-flow');
    });
    scope.stop();
  });

  it('updates loading and error refs from manager events', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.emit('loadingChanged', { displayLoading: true });
      expect(wf.loading.value).toBe(true);

      manager.emit('loadingChanged', { displayLoading: false });
      expect(wf.loading.value).toBe(false);

      manager.emit('transitionError', {
        code: 'transition_failed',
        message: 'Boom',
        statusCode: 500,
      });
      expect(wf.error.value?.code).toBe('transition_failed');
    });
    scope.stop();
  });

  it('captures navigationRequested events scoped to the workflow', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.emit('navigationRequested', {
        pageContext: {
          workflowName: 'kyc',
          instanceId: 'inst-1',
          workflowDomain: 'onboarding',
          workflowVersion: '1.0.0',
        },
        navigationPath: '/onboarding/kyc/login',
        navigationType: 'push',
        hasView: true,
      });
      expect(wf.navigation.value?.navigationPath).toBe('/onboarding/kyc/login');

      manager.emit('navigationRequested', {
        pageContext: {
          workflowName: 'other-flow',
          instanceId: 'inst-99',
          workflowDomain: 'onboarding',
          workflowVersion: '1.0.0',
        },
        navigationPath: '/other',
        navigationType: 'push',
        hasView: true,
      });
      // Still the previous nav — second one was for another flow
      expect(wf.navigation.value?.navigationPath).toBe('/onboarding/kyc/login');
    });
    scope.stop();
  });

  it('marks status terminal for completed and faulted', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.setCachedState('kyc', makeState('kyc', 'done', 'completed'));
      manager.emit('stateChanged', {
        workflowName: 'kyc',
        instanceId: 'inst-1',
        state: 'done',
        status: 'completed',
      });
      expect(wf.isTerminal.value).toBe(true);

      manager.setCachedState('kyc', makeState('kyc', 'crash', 'faulted'));
      manager.emit('stateChanged', {
        workflowName: 'kyc',
        instanceId: 'inst-1',
        state: 'crash',
        status: 'faulted',
      });
      expect(wf.isTerminal.value).toBe(true);
    });
    scope.stop();
  });

  it('binds domain/name when calling lifecycle actions', async () => {
    const scope = effectScope();
    await scope.run(async () => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      await wf.start({ attributes: { foo: 1 } });
      expect(manager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'onboarding', name: 'kyc', attributes: { foo: 1 } }),
      );

      await wf.transition({ transitionKey: 'submit' });
      expect(manager.startTransition).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'onboarding', name: 'kyc', transitionKey: 'submit' }),
      );

      await wf.continueWith({ instanceId: 'inst-1' });
      expect(manager.continueWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'onboarding', name: 'kyc', instanceId: 'inst-1' }),
      );
    });
    scope.stop();
  });

  it('infers instanceId for retry from cache when omitted', async () => {
    const scope = effectScope();
    await scope.run(async () => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });

      manager.setCachedState('kyc', makeState('kyc', 'login', 'active'));
      manager.emit('stateChanged', {
        workflowName: 'kyc',
        instanceId: 'inst-1',
        state: 'login',
        status: 'active',
      });

      await wf.retry();
      expect(manager.retryWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'onboarding', name: 'kyc', instanceId: 'inst-1' }),
      );
    });
    scope.stop();
  });

  it('returns invalid_input when retry has no instanceId', async () => {
    const scope = effectScope();
    await scope.run(async () => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });
      const result = await wf.retry();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error?.code).toBe('invalid_input');
      }
      expect(manager.retryWorkflow).not.toHaveBeenCalled();
    });
    scope.stop();
  });

  it('detaches all listeners when the effect scope is disposed', () => {
    const scope = effectScope();
    let wf!: ReturnType<typeof useWorkflow>;
    scope.run(() => {
      wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });
    });
    expect(manager.listenerCount('stateChanged')).toBe(1);
    expect(manager.listenerCount('loadingChanged')).toBe(1);

    scope.stop();

    expect(manager.listenerCount('stateChanged')).toBe(0);
    expect(manager.listenerCount('loadingChanged')).toBe(0);
    expect(manager.listenerCount('transitionError')).toBe(0);

    // detach is idempotent
    wf.detach();
    expect(manager.listenerCount('stateChanged')).toBe(0);
  });

  it('attach is idempotent — second call does not double-subscribe', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });
      wf.attach();
      wf.attach();
      expect(manager.listenerCount('stateChanged')).toBe(1);
    });
    scope.stop();
  });

  it('on() returns an unsubscribe function tied to the manager', () => {
    const scope = effectScope();
    scope.run(() => {
      const wf = useWorkflow({ manager: manager as never, domain: 'onboarding', name: 'kyc' });
      const handler = vi.fn();
      const unsubscribe = wf.on('pollingStarted', handler);

      manager.emit('pollingStarted', { workflowName: 'kyc', instanceId: 'inst-1' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.emit('pollingStarted', { workflowName: 'kyc', instanceId: 'inst-1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
    scope.stop();
  });

  it('autoStart triggers start() with provided input on mount', async () => {
    const scope = effectScope();
    await scope.run(async () => {
      useWorkflow({
        manager: manager as never,
        domain: 'onboarding',
        name: 'kyc',
        autoStart: true,
        autoStartInput: { attributes: { auto: true } },
      });
      // give the microtask queue a turn
      await Promise.resolve();
      expect(manager.startWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ attributes: { auto: true }, domain: 'onboarding', name: 'kyc' }),
      );
    });
    scope.stop();
  });
});
