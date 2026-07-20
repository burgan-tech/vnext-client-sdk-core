/**
 * Public facade — `WorkflowManager`. All methods route to the manager layer
 * and never contain business logic of their own. The class is intentionally
 * thin so multiple consumers (Vue composable, Flutter binding, raw Node CLI)
 * can target the same surface.
 *
 * Public API contract: `docs/workflow-manager-interface.md` §1.
 */

import { resolveOptions } from './runtime/resolve-options.js';
import { bindHandlers, compose, type ComposedDependencies } from './runtime/compose.js';
import {
  parseGetInstanceResponse,
  parseRetryInstanceOutput,
  parseStartInstanceOutput,
  parseStateFunctionResponse,
  parseTransitionHistoryResponse,
  parseTransitionOutput,
  parseQueryResponse,
  errorPayloadFromResponse,
} from './utils/response.js';
import { instanceStatusFromWire } from './enums.js';
import type {
  ContinueWorkflowInput,
  ContinueWorkflowResult,
  DomainFunctionInput,
  FunctionCallResult,
  GetInstanceInput,
  GetInstanceResult,
  GetTransitionHistoryInput,
  GetTransitionHistoryResult,
  HttpResponse,
  InstanceFunctionInput,
  QueryInstancesInput,
  QueryInstancesResult,
  RetryWorkflowInput,
  RetryWorkflowResult,
  StartTransitionInput,
  StartTransitionResult,
  StartWorkflowInput,
  StartWorkflowResult,
  Subscription,
  VNextFilter,
  VNextFilterOrGroup,
  VNextSort,
  WorkflowEventMap,
  WorkflowManagerOptions,
} from './types.js';
import { pickLongPollingConfig } from './runtime/resolve-options.js';
import { is304 } from './utils/etag.js';
import type { LongPollingHandle, PollKey, PollTickResult } from './managers/long-polling-manager.js';

export class WorkflowManager {
  private readonly deps: ComposedDependencies;
  private readonly polls = new Map<string, LongPollingHandle>();
  private _isDisposed = false;

  private constructor(deps: ComposedDependencies) {
    this.deps = deps;
  }

  static create(options: WorkflowManagerOptions): WorkflowManager {
    const resolved = resolveOptions(options);
    const deps = compose(resolved);
    const instance = new WorkflowManager(deps);
    bindHandlers(deps, {
      startWorkflow: (input) => instance.startWorkflow(input),
      startTransition: (input) => instance.startTransition(input),
      continueWorkflow: (input) => instance.continueWorkflow(input),
    });
    return instance;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==========================================================================
  // events
  // ==========================================================================

  on<K extends keyof WorkflowEventMap>(
    event: K,
    handler: (payload: WorkflowEventMap[K]) => void,
  ): Subscription {
    return this.deps.events.on(event, handler);
  }

  // ==========================================================================
  // lifecycle
  // ==========================================================================

  async startWorkflow(input: StartWorkflowInput): Promise<StartWorkflowResult> {
    if (this._isDisposed) return disposedResult();
    const displayLoading = input.displayLoading ?? this.deps.options.displayLoadingByDefault;
    if (displayLoading) this.emitLoading(true);

    try {
      // Body filter also runs on start (transitionKey "start", no instance yet):
      // the schema-driven resolver injects x-context-source attributes so a start
      // needs no per-flow wiring, exactly like a transition.
      let attributes = input.attributes ?? {};
      const filter = this.deps.options.transitionBodyFilter;
      if (filter) {
        attributes = await filter.filterTransitionBody({
          workflowDomain: input.domain,
          workflowName: input.name,
          instanceId: '',
          transitionKey: 'start',
          body: attributes,
        });
      }

      const response = await this.deps.api.startInstance(
        { ...input, attributes },
        {
          sync: input.sync ?? this.deps.options.syncStart,
          defaultExtensions: this.deps.options.extensions,
        },
      );

      const result = parseStartInstanceOutput(response);
      if (result.ok && result.instanceId) {
        // seed cache + start polling
        this.afterLifecycleResponse({
          domain: input.domain,
          name: input.name,
          version: input.version ?? this.deps.options.defaultVersion,
          instanceId: result.instanceId,
        });
      } else if (!result.ok) {
        this.emitTransitionError(response, 'startWorkflow failed');
      }
      return result;
    } finally {
      if (displayLoading) this.emitLoading(false);
    }
  }

  async startTransition(input: StartTransitionInput): Promise<StartTransitionResult> {
    if (this._isDisposed) return disposedResult();
    const displayLoading = input.displayLoading ?? this.deps.options.displayLoadingByDefault;
    if (displayLoading) this.emitLoading(true);

    try {
      const instanceId =
        input.instanceId ?? this.deps.stateManager.getInstanceId(input.name);
      if (!instanceId) {
        const err: StartTransitionResult = {
          ok: false,
          error: { code: 'invalid_input', message: `No instanceId for workflow "${input.name}"` },
        };
        return err;
      }

      // Body filter
      let body = input.body ?? {};
      const filter = this.deps.options.transitionBodyFilter;
      if (filter) {
        body = await filter.filterTransitionBody({
          workflowDomain: input.domain,
          workflowName: input.name,
          instanceId,
          transitionKey: input.transitionKey,
          body,
        });
      }

      const response = await this.deps.api.transition(
        { ...input, body },
        {
          instanceIdOrKey: instanceId,
          sync: input.sync ?? this.deps.options.syncTransition,
          defaultExtensions: this.deps.options.extensions,
        },
      );

      const result = parseTransitionOutput(response);
      if (result.ok) {
        this.afterLifecycleResponse({
          domain: input.domain,
          name: input.name,
          version: input.version ?? this.deps.options.defaultVersion,
          instanceId: result.instanceId ?? instanceId,
          forceRefresh: true,
        });
      } else {
        this.emitTransitionError(response, 'startTransition failed');
      }
      return result;
    } finally {
      if (displayLoading) this.emitLoading(false);
    }
  }

  async startAwaitingTransition(input: {
    transitionKey: string;
    additionalData?: Record<string, unknown>;
  }): Promise<StartTransitionResult> {
    if (this._isDisposed) return disposedResult();

    // Find a matching awaiting entry across all known instances. The map is
    // small in practice; iterating here keeps the API ergonomic.
    let foundEntry = null;
    for (const state of this.deps.stateManager.list()) {
      const candidate = this.deps.awaiting.get(state.instanceId, input.transitionKey);
      if (candidate) {
        foundEntry = candidate;
        break;
      }
    }

    if (!foundEntry) {
      return {
        ok: false,
        error: {
          code: 'no_awaiting_transition',
          message: `No awaiting transition for key "${input.transitionKey}"`,
        },
      };
    }

    this.deps.awaiting.cancel(foundEntry.instanceId, foundEntry.transitionKey);
    const merged: StartTransitionInput = {
      ...foundEntry.request,
      body: { ...(foundEntry.request.body ?? {}), ...(input.additionalData ?? {}) },
    };
    return this.startTransition(merged);
  }

  cancelAwaitingTransition(input?: { transitionKey?: string }): void {
    if (this._isDisposed) return;
    if (!input?.transitionKey) {
      // cancel everything across all instances
      for (const state of this.deps.stateManager.list()) {
        this.deps.awaiting.cancelAllFor(state.instanceId);
      }
      return;
    }
    for (const state of this.deps.stateManager.list()) {
      this.deps.awaiting.cancel(state.instanceId, input.transitionKey);
    }
  }

  async retryWorkflow(input: RetryWorkflowInput): Promise<RetryWorkflowResult> {
    if (this._isDisposed) return disposedResult();
    const displayLoading = input.displayLoading ?? this.deps.options.displayLoadingByDefault;
    if (displayLoading) this.emitLoading(true);

    try {
      const response = await this.deps.api.retry({
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceId,
        sync: input.sync ?? this.deps.options.syncRetry,
        body: { attributes: input.attributes ?? {}, ...(input.key ? { key: input.key } : {}), ...(input.tags ? { tags: input.tags } : {}) },
      });
      const result = parseRetryInstanceOutput(response);
      if (result.ok) {
        this.afterLifecycleResponse({
          domain: input.domain,
          name: input.name,
          version: input.version ?? this.deps.options.defaultVersion,
          instanceId: result.instanceId ?? input.instanceId,
          forceRefresh: true,
        });
      }
      return result;
    } finally {
      if (displayLoading) this.emitLoading(false);
    }
  }

  async continueWorkflow(input: ContinueWorkflowInput): Promise<ContinueWorkflowResult> {
    if (this._isDisposed) return disposedResult();
    const displayLoading = input.displayLoading ?? this.deps.options.displayLoadingByDefault;
    if (displayLoading) this.emitLoading(true);

    try {
      // Trigger an immediate state fetch which seeds the cache.
      const response = await this.deps.api.getInstanceState({
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceId,
      });

      if (!response.ok && !is304(response)) {
        const out: ContinueWorkflowResult = {
          ok: false,
          instanceId: input.instanceId,
          statusCode: response.status,
          error: errorPayloadFromResponse(response, 'continueWorkflow failed'),
        };
        return out;
      }

      let status: ContinueWorkflowResult['status'] | undefined;
      if (!is304(response)) {
        const raw = parseStateFunctionResponse(response);
        status = instanceStatusFromWire(raw.status);
        await this.deps.processor.process(raw, response, {
          workflowDomain: input.domain,
          workflowName: input.name,
          workflowVersion: input.version ?? this.deps.options.defaultVersion,
          instanceId: input.instanceId,
        });
      }

      this.startPolling({
        workflowDomain: input.domain,
        workflowName: input.name,
        instanceId: input.instanceId,
      });

      const result: ContinueWorkflowResult = {
        ok: true,
        instanceId: input.instanceId,
        statusCode: response.status,
        ...(status !== undefined ? { status } : {}),
      };
      return result;
    } finally {
      if (displayLoading) this.emitLoading(false);
    }
  }

  terminateWorkflow(input: { workflowName: string }): void {
    if (this._isDisposed) return;
    const state = this.deps.stateManager.get(input.workflowName);
    if (!state) return;
    this.stopPolling({
      workflowDomain: state.domain,
      workflowName: state.workflowName,
      instanceId: state.instanceId,
    }, 'terminated');
    this.deps.dataManager.delete(state.instanceId);
    this.deps.viewCache.delete(state.instanceId);
    this.deps.schemaManager.delete(state.instanceId);
    this.deps.awaiting.cancelAllFor(state.instanceId);
    this.deps.stateManager.delete(input.workflowName);
  }

  // ==========================================================================
  // queries
  // ==========================================================================

  /**
   * One-shot envelope read for `GET /instances/{instanceIdOrKey}`.
   *
   * Unlike `continueWorkflow()`, this call does NOT seed the polling cache
   * or trigger long-polling — it's intended for detail screens, exports,
   * and audit views that want the full payload (metadata + attributes +
   * extensions + ETags).
   *
   * Returns `notModified: true` when the supplied `ifNoneMatch` matches the
   * current snapshot ETag (HTTP 304).
   */
  async getInstance(input: GetInstanceInput): Promise<GetInstanceResult> {
    if (this._isDisposed) {
      return { ok: false, instance: null, error: { code: 'disposed' } };
    }
    const response = await this.deps.api.getInstance({
      domain: input.domain,
      name: input.name,
      instanceIdOrKey: input.instanceId,
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.extensions !== undefined ? { extensions: input.extensions } : {}),
      ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
    });

    if (is304(response)) {
      return {
        ok: true,
        instance: null,
        notModified: true,
        statusCode: response.status,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        instance: null,
        statusCode: response.status,
        error: errorPayloadFromResponse(response, 'getInstance failed'),
      };
    }

    return {
      ok: true,
      instance: parseGetInstanceResponse(response),
      statusCode: response.status,
    };
  }

  async callDomainFunction(input: DomainFunctionInput): Promise<FunctionCallResult> {
    if (this._isDisposed) return { ok: false, data: null, error: { code: 'disposed' } };
    const response = await this.deps.api.domainFunction(input);
    return functionResult(response);
  }

  async callInstanceFunction(input: InstanceFunctionInput): Promise<FunctionCallResult> {
    if (this._isDisposed) return { ok: false, data: null, error: { code: 'disposed' } };
    const response = await this.deps.api.instanceFunction({
      domain: input.domain,
      name: input.name,
      instanceIdOrKey: input.instanceId,
      functionName: input.functionName,
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.extensions !== undefined ? { extensions: input.extensions } : {}),
      ...(input.transitionKey !== undefined ? { transitionKey: input.transitionKey } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.functionKey !== undefined ? { functionKey: input.functionKey } : {}),
      ...(input.queryRoles !== undefined ? { queryRoles: input.queryRoles } : {}),
      ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
      ...(input.queryParameters !== undefined ? { queryParameters: input.queryParameters } : {}),
    });
    return functionResult(response);
  }

  async queryInstances(input: QueryInstancesInput): Promise<QueryInstancesResult> {
    if (this._isDisposed) return disposedQuery();

    const filterString = serializeFilter(input.filter);
    const sortString = serializeSort(input.sort);

    const response = await this.deps.api.queryInstances({
      domain: input.domain,
      name: input.name,
      ...(filterString !== undefined ? { filter: filterString } : {}),
      ...(sortString !== undefined ? { sort: sortString } : {}),
      ...(input.page !== undefined ? { page: input.page } : {}),
      ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.extensions !== undefined ? { extensions: input.extensions } : {}),
    });

    const parsed = parseQueryResponse(response);
    const out: QueryInstancesResult = {
      ok: response.ok,
      items: parsed.items,
      links: parsed.links,
      raw: parsed.raw,
      statusCode: response.status,
    };
    if (!response.ok) out.error = errorPayloadFromResponse(response, 'queryInstances failed');
    return out;
  }

  async getTransitionHistory(input: GetTransitionHistoryInput): Promise<GetTransitionHistoryResult> {
    if (this._isDisposed) {
      return { ok: false, transitions: [], error: { code: 'disposed' } };
    }
    const response = await this.deps.api.getTransitionHistory({
      domain: input.domain,
      name: input.name,
      instanceIdOrKey: input.instanceId,
    });
    const out: GetTransitionHistoryResult = {
      ok: response.ok,
      transitions: parseTransitionHistoryResponse(response),
      statusCode: response.status,
    };
    if (!response.ok) out.error = errorPayloadFromResponse(response, 'getTransitionHistory failed');
    return out;
  }

  // ==========================================================================
  // state read
  // ==========================================================================

  getStateByWorkflowName(workflowName: string) {
    return this.deps.stateManager.get(workflowName);
  }

  getViewContent(instanceId: string): Record<string, unknown> | null {
    return this.deps.viewCache.get(instanceId);
  }

  getData(instanceId: string): Record<string, unknown> | null {
    return this.deps.dataManager.get(instanceId);
  }

  isWorkflowRegistered(input: { domain: string; name: string }): boolean {
    return this.deps.options.workflows.some((w) => w.domain === input.domain && w.name === input.name);
  }

  // ==========================================================================
  // teardown
  // ==========================================================================

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this.deps.longPolling.stopAll('disposed');
    this.polls.clear();
    this.deps.stateManager.clear();
    this.deps.viewCache.clear();
    this.deps.dataManager.clear();
    this.deps.schemaManager.clear();
    this.deps.awaiting.clear();
    this.deps.events.removeAllListeners();
  }

  // ==========================================================================
  // internals
  // ==========================================================================

  private emitLoading(displayLoading: boolean): void {
    this.deps.events.emit('loadingChanged', { displayLoading });
    this.deps.options.onLoadingChanged?.({ displayLoading });
  }

  private emitTransitionError(response: HttpResponse<unknown>, fallback: string): void {
    const payload = errorPayloadFromResponse(response, fallback);
    const event = { ...payload, statusCode: response.status };
    this.deps.events.emit('transitionError', event);
    this.deps.options.onTransitionError?.(event);
  }

  /** Start polling after a successful lifecycle call. State processing is handled
   *  exclusively by polling ticks — no eager pre-poll fetch or process here.
   */
  private afterLifecycleResponse(input: {
    domain: string;
    name: string;
    version: string;
    instanceId: string;
    forceRefresh?: boolean;
  }): void {
    this.startPolling({
      workflowDomain: input.domain,
      workflowName: input.name,
      instanceId: input.instanceId,
    });
  }

  private startPolling(key: PollKey): void {
    if (this._isDisposed) return;
    const id = pollKeyId(key);
    // Always restart polling after a lifecycle action so the first tick fetches
    // the authoritative post-transition state (no stale eTag from a prior poll).
    const existing = this.polls.get(id);
    if (existing?.isRunning()) existing.stop('terminated');

    const config = pickLongPollingConfig(this.deps.options, key.workflowName);
    const handle = this.deps.longPolling.start({
      key,
      config,
      driver: {
        fetchState: (input) =>
          this.deps.api.getInstanceState({
            domain: key.workflowDomain,
            name: key.workflowName,
            instanceIdOrKey: key.instanceId,
            ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
            timeoutMs: input.timeoutMs,
          }),
        onTick: async (result: PollTickResult) => {
          if (result.kind === 'state') {
            const decision = await this.deps.processor.process(result.raw, result.response, {
              workflowDomain: key.workflowDomain,
              workflowName: key.workflowName,
              workflowVersion: this.deps.options.defaultVersion,
              instanceId: key.instanceId,
            });
            if (decision.stop) return { stop: decision.stop };
            return undefined;
          }
          if (result.kind === 'notModified') {
            const cachedStatus = this.deps.stateManager.get(key.workflowName)?.status;
            if (cachedStatus !== 'busy') {
              return { stop: 'stable' };
            }
            this.deps.events.emit('pollingNotModified', {
              workflowName: key.workflowName,
              instanceId: key.instanceId,
            });
            return undefined;
          }
          return undefined;
        },
        onStopped: (reason) => {
          this.deps.events.emit('pollingStopped', {
            workflowName: key.workflowName,
            instanceId: key.instanceId,
            reason,
          });
          this.polls.delete(id);
        },
      },
      ...(this.deps.stateManager.getETag(key.workflowName) !== undefined
        ? { initialETag: this.deps.stateManager.getETag(key.workflowName) as string }
        : {}),
    });

    this.polls.set(id, handle);
    this.deps.events.emit('pollingStarted', {
      workflowName: key.workflowName,
      instanceId: key.instanceId,
    });
  }

  private stopPolling(key: PollKey, reason: 'terminated' | 'disposed' = 'terminated'): void {
    const id = pollKeyId(key);
    const handle = this.polls.get(id);
    handle?.stop(reason);
    this.polls.delete(id);
  }
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function pollKeyId(key: PollKey): string {
  return `${key.workflowDomain}:${key.workflowName}:${key.instanceId}`;
}

function disposedResult(): StartWorkflowResult & StartTransitionResult & RetryWorkflowResult & ContinueWorkflowResult {
  return { ok: false, error: { code: 'disposed', message: 'WorkflowManager is disposed' } } as never;
}

function disposedQuery(): QueryInstancesResult {
  return {
    ok: false,
    items: [],
    links: { self: '', first: '', next: '', prev: '' },
    raw: {},
    error: { code: 'disposed', message: 'WorkflowManager is disposed' },
  };
}

function functionResult(response: HttpResponse<unknown>): FunctionCallResult {
  if (is304(response)) {
    return {
      ok: true,
      data: null,
      notModified: true,
      statusCode: response.status,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      data: null,
      statusCode: response.status,
      error: errorPayloadFromResponse(response, 'function call failed'),
    };
  }
  return {
    ok: true,
    data: (response.data as Record<string, unknown>) ?? null,
    statusCode: response.status,
  };
}

function serializeFilter(
  filter: VNextFilter[] | VNextFilterOrGroup | string | undefined,
): string | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter === 'string') return filter;

  if (Array.isArray(filter)) {
    if (filter.length === 0) return undefined;
    if (filter.length === 1) return JSON.stringify(filterToObject(filter[0]!));
    // multiple filters = AND → multiple `filter=` params encoded by the api
    // service via a single string with comma separation is not sufficient; for
    // simplicity we serialize a top-level `and` group when multiple filters
    // are given. The runtime accepts this shape from v0.0.42+.
    return JSON.stringify({ and: filter.map(filterToObject) });
  }

  if ('or' in filter) {
    return JSON.stringify({ or: filter.or.map(filterToObject) });
  }

  return undefined;
}

function filterToObject(filter: VNextFilter): Record<string, unknown> {
  const inner = { [filter.operator]: filter.value };
  if (filter.isAttribute) {
    return { attributes: { [filter.field]: inner } };
  }
  return { [filter.field]: inner };
}

function serializeSort(sort: VNextSort | VNextSort[] | undefined): string | undefined {
  if (sort === undefined) return undefined;
  if (Array.isArray(sort)) {
    if (sort.length === 0) return undefined;
    return JSON.stringify({ fields: sort });
  }
  return JSON.stringify(sort);
}
