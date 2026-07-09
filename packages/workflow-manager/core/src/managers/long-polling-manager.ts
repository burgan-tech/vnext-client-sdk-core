/**
 * Recursive `setTimeout`-based long polling on the `state` instance function.
 *
 * Behavior:
 *  - One handle per (workflow, instance) pair. Starting again restarts the timer.
 *  - Stops automatically when status reaches `completed` / `faulted`, when the
 *    overall `durationSeconds` budget is exhausted (timeout), or on explicit
 *    `stop()` / `dispose()`.
 *  - Forwards `If-None-Match` (last seen `eTag`) on every tick when
 *    `useETag: true`. 304 responses are surfaced via `pollingNotModified` so
 *    consumers see the polling is alive without a full state fetch.
 *  - Each tick yields a structured `PollTickResult` so the orchestrating layer
 *    (state processor) decides what to do with the new state.
 */

import type {
  HttpResponse,
  LongPollingConfig,
  Timer,
  TimerHandle,
  VNextStateFunctionResponse,
} from '../types.js';
import { is304 } from '../utils/etag.js';
import { parseStateFunctionResponse } from '../utils/response.js';

export interface PollKey {
  workflowName: string;
  instanceId: string;
  workflowDomain: string;
}

export type PollStopReason = 'completed' | 'faulted' | 'timeout' | 'disposed' | 'terminated' | 'stable';

export type PollTickResult =
  | { kind: 'state'; raw: VNextStateFunctionResponse; response: HttpResponse<unknown> }
  | { kind: 'notModified' }
  | { kind: 'error'; response: HttpResponse<unknown> };

export interface LongPollingHandle {
  readonly key: PollKey;
  stop(reason?: PollStopReason): void;
  isRunning(): boolean;
}

export interface PollDriver {
  fetchState(input: { ifNoneMatch?: string; timeoutMs: number }): Promise<HttpResponse<unknown>>;
  onTick(result: PollTickResult): Promise<{ stop?: PollStopReason } | void>;
  onStopped(reason: PollStopReason): void;
}

interface InternalState {
  handle?: TimerHandle;
  startedAtMs: number;
  lastETag?: string;
  running: boolean;
}

export class LongPollingManager {
  private readonly timer: Timer;
  private readonly handles = new Map<string, InternalState>();

  constructor(opts: { timer: Timer }) {
    this.timer = opts.timer;
  }

  static keyOf(key: PollKey): string {
    return `${key.workflowDomain}:${key.workflowName}:${key.instanceId}`;
  }

  start(input: {
    key: PollKey;
    config: LongPollingConfig;
    driver: PollDriver;
    initialETag?: string;
  }): LongPollingHandle {
    const id = LongPollingManager.keyOf(input.key);
    this.stop(input.key, 'terminated');

    const state: InternalState = {
      startedAtMs: this.timer.now(),
      running: true,
      ...(input.initialETag !== undefined ? { lastETag: input.initialETag } : {}),
    };
    this.handles.set(id, state);

    const tick = async (): Promise<void> => {
      if (!state.running) return;

      const elapsed = this.timer.now() - state.startedAtMs;
      const deadlineMs = input.config.durationSeconds * 1000;
      if (elapsed >= deadlineMs) {
        this.stop(input.key, 'timeout');
        input.driver.onStopped('timeout');
        return;
      }

      let result: PollTickResult;
      try {
        const response = await input.driver.fetchState({
          ...(input.config.useETag !== false && state.lastETag !== undefined
            ? { ifNoneMatch: state.lastETag }
            : {}),
          timeoutMs: input.config.timeoutSeconds * 1000,
        });

        if (is304(response)) {
          result = { kind: 'notModified' };
        } else if (!response.ok) {
          result = { kind: 'error', response };
        } else {
          const raw = parseStateFunctionResponse(response);
          if (raw.eTag) state.lastETag = raw.eTag;
          result = { kind: 'state', raw, response };
        }
      } catch (e) {
        result = {
          kind: 'error',
          response: {
            ok: false,
            status: 0,
            headers: {},
            data: null,
          },
        };
        // surface to driver via onTick; don't stop here unless driver requests it
        void e;
      }

      let driverDecision: { stop?: PollStopReason } | void = undefined;
      try {
        driverDecision = await input.driver.onTick(result);
      } catch {
        // driver bug — keep polling alive
      }

      if (!state.running) return;

      if (driverDecision?.stop) {
        this.stop(input.key, driverDecision.stop);
        input.driver.onStopped(driverDecision.stop);
        return;
      }

      // schedule the next tick
      state.handle = this.timer.setTimeout(() => {
        void tick();
      }, input.config.intervalSeconds * 1000);
    };

    // First tick is scheduled with the configured interval too — the caller
    // has already done a synchronous fetch (start/transition); polling is
    // a follow-up.
    state.handle = this.timer.setTimeout(() => {
      void tick();
    }, input.config.intervalSeconds * 1000);

    return {
      key: input.key,
      isRunning: () => state.running,
      stop: (reason: PollStopReason = 'terminated') => {
        this.stop(input.key, reason);
        input.driver.onStopped(reason);
      },
    };
  }

  stop(key: PollKey, _reason: PollStopReason = 'terminated'): void {
    const id = LongPollingManager.keyOf(key);
    const state = this.handles.get(id);
    if (!state) return;
    state.running = false;
    if (state.handle !== undefined) {
      this.timer.clearTimeout(state.handle);
      delete state.handle;
    }
    this.handles.delete(id);
  }

  isRunning(key: PollKey): boolean {
    return this.handles.get(LongPollingManager.keyOf(key))?.running === true;
  }

  stopAll(reason: PollStopReason = 'disposed'): void {
    for (const [, state] of this.handles) {
      state.running = false;
      if (state.handle !== undefined) {
        this.timer.clearTimeout(state.handle);
        delete state.handle;
      }
    }
    this.handles.clear();
    void reason;
  }
}
