/**
 * Translates a `state function` response into SDK-side side effects:
 *  - Updates the cached `VNextState` (status, transitions, view ref).
 *  - Pulls fresh `data` when the loader signals it (or status changed).
 *  - Loads & dispatches the active view (UI vs action) through handlers.
 *  - Emits navigation, state and error events.
 *  - Hands the polling driver a stop signal when terminal status is reached.
 *
 * The processor is the single place that knows how to **assemble** the SDK's
 * cached state from the raw wire DTOs.
 */

import type { ViewHandlerRegistry } from '../handlers/view-handler-registry.js';
import type {
  ExtensionToken,
  HttpResponse,
  NavigationRequest,
  OnLog,
  VNextData,
  VNextInstanceStatus,
  VNextStateFunctionResponse,
  VNextView,
  VNextViewType,
} from '../types.js';
import type { EventEmitter } from '../runtime/event-emitter.js';
import type { WorkflowEventMap } from '../types.js';
import {
  displayModeFromWire,
  displayModeToNavigationType,
  instanceStatusFromWire,
  viewTypeFromWire,
} from '../enums.js';
import type { DataManager } from './data-manager.js';
import type { StateManager } from './state-manager.js';
import type { ViewCacheManager } from './view-manager.js';
import type { ViewLoader } from '../types.js';
import type { PollStopReason } from './long-polling-manager.js';

export interface ProcessContext {
  workflowDomain: string;
  workflowName: string;
  workflowVersion: string;
  instanceId: string;
}

export interface ProcessOptions {
  /**
   * Forces a re-fetch of view + data, even if state didn't change. Useful
   * after a successful transition where the cache must always refresh.
   */
  forceRefresh?: boolean;
}

export interface ProcessResult {
  status: VNextInstanceStatus;
  /** When set, the polling driver should stop with this reason. */
  stop?: PollStopReason;
}

export interface WorkflowStateProcessorDeps {
  stateManager: StateManager;
  viewCache: ViewCacheManager;
  dataManager: DataManager;
  viewLoader: ViewLoader;
  handlerRegistry: ViewHandlerRegistry;
  events: EventEmitter<WorkflowEventMap>;
  onLog?: OnLog;
}

export class WorkflowStateProcessor {
  constructor(private readonly deps: WorkflowStateProcessorDeps) {}

  async process(
    raw: VNextStateFunctionResponse,
    _response: HttpResponse<unknown>,
    context: ProcessContext,
    options: ProcessOptions = {},
  ): Promise<ProcessResult> {
    const { stateManager, dataManager, viewLoader, viewCache, handlerRegistry, events, onLog } = this.deps;

    const status = instanceStatusFromWire(raw.status, (rawValue) =>
      onLog?.('warn', `Unknown wire status "${rawValue}"`, undefined, { ...context }),
    );

    const previous = stateManager.get(context.workflowName);
    const currentEtagsChanged = previous?.eTag !== raw.eTag;
    const stateChanged = previous?.currentState !== raw.state || previous?.status !== status;

    // Prefer the state-response's own stateType; fall back to the cached one
    // (envelope-enriched) for backends that omit it on the state function.
    const stateType = raw.stateType ?? previous?.stateType;

    // Always update the cached state (transitions/href etc. may have changed even
    // when state name didn't).
    const nextState = {
      workflowName: context.workflowName,
      domain: context.workflowDomain,
      instanceId: context.instanceId,
      currentState: raw.state,
      status,
      data: previous?.data ?? emptyData(),
      view: previous?.view ?? null,
      transitions: raw.transitions,
      activeCorrelations: raw.activeCorrelations,
      eTag: raw.eTag,
      ...(raw.entityEtag !== undefined ? { entityEtag: raw.entityEtag } : {}),
      ...(previous?.flowVersion ? { flowVersion: previous.flowVersion } : {}),
      ...(stateType ? { stateType } : {}),
      ...(previous?.stateSubType ? { stateSubType: previous.stateSubType } : {}),
    };

    let stateForCache = nextState;

    // Fetch fresh data when something changed or the caller forces a refresh.
    const shouldFetchData =
      options.forceRefresh ||
      stateChanged ||
      currentEtagsChanged ||
      // load even on first observation (no `data` yet)
      previous === null;

    if (shouldFetchData) {
      const fetched = await dataManager.fetch({
        workflowDomain: context.workflowDomain,
        workflowName: context.workflowName,
        instanceId: context.instanceId,
        stateName: raw.state,
      });
      if (fetched) {
        stateForCache = { ...stateForCache, data: fetched };
        // Forward extensionToken if present.
        const token = pickExtensionToken(fetched);
        if (token) events.emit('tokenRefreshRequested', token);
      }
    }

    // Load and dispatch view if backend signals one.
    if (raw.view.hasView) {
      const view = await this.loadView({
        viewLoader,
        context,
        href: raw.view.href,
      });
      if (view) {
        stateForCache = { ...stateForCache, view };
        viewCache.set({ instanceId: context.instanceId, content: view.content });

        const handler = handlerRegistry.resolve(view);
        if (handler) {
          // Action views (http/deepLink/urn) are dispatched.
          const result = await handler.handle(view, {
            workflowDomain: context.workflowDomain,
            workflowName: context.workflowName,
            instanceId: context.instanceId,
            previousData: stateForCache.data.data,
          });
          if (!result.success) {
            events.emit('viewActionFailed', {
              viewType: view.viewType,
              error: result.error,
              ...(result.message !== undefined ? { message: result.message } : {}),
            });
          }
        } else {
          // UI view — surface as navigation request.
          events.emit('navigationRequested', this.buildNavigationRequest(view, context));
        }
      }
    }

    stateManager.set(stateForCache);

    if (stateChanged) {
      events.emit('stateChanged', {
        workflowName: context.workflowName,
        instanceId: context.instanceId,
        state: raw.state,
        status,
        ...(stateForCache.stateType ? { stateType: stateForCache.stateType } : {}),
        ...(stateForCache.stateSubType ? { stateSubType: stateForCache.stateSubType } : {}),
      });
    }

    if (status === 'completed') return { status, stop: 'completed' };
    if (status === 'faulted') return { status, stop: 'faulted' };
    return { status };
  }

  private async loadView(input: {
    viewLoader: ViewLoader;
    context: ProcessContext;
    href: string;
  }): Promise<VNextView | null> {
    const result = await input.viewLoader.loadViewByReference({
      viewRef: {
        key: '',
        version: input.context.workflowVersion,
        domain: input.context.workflowDomain,
        flow: input.context.workflowName,
        flowVersion: input.context.workflowVersion,
      },
      instanceId: input.context.instanceId,
    });

    if (!result || result.notModified || !result.data) return null;

    const raw = result.data;
    const viewType = viewTypeFromWire(raw.type, (rawType) =>
      this.deps.onLog?.('warn', `Unknown view type "${rawType}"`, undefined, {
        instanceId: input.context.instanceId,
      }),
    );
    const display = displayModeFromWire(raw.display, (rawMode) =>
      this.deps.onLog?.('warn', `Unknown display mode "${rawMode}"`, undefined, {
        instanceId: input.context.instanceId,
      }),
    );

    return {
      pageId: raw.key,
      content: normaliseViewContent(raw.content, viewType),
      displayType: display,
      viewType,
    };
  }

  private buildNavigationRequest(view: VNextView, context: ProcessContext): NavigationRequest {
    const navigationType = displayModeToNavigationType(view.displayType);
    return {
      pageContext: {
        instanceId: context.instanceId,
        workflowName: context.workflowName,
        workflowDomain: context.workflowDomain,
        workflowVersion: context.workflowVersion,
      },
      navigationPath: view.pageId,
      navigationType,
      displayMode: view.displayType,
      initialData: view.content,
      hasView: true,
    };
  }
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function emptyData(): VNextData {
  return { data: {}, extensions: {} };
}

function pickExtensionToken(data: VNextData): ExtensionToken | undefined {
  const ext = data.extensions ?? {};
  const candidate = (ext.extensionToken ?? ext.ExtensionToken) as
    | { accessToken?: string; refreshToken?: string; accessTokenExpiresIn?: number; refreshTokenExpiresIn?: number }
    | undefined;
  if (
    candidate?.accessToken &&
    candidate.refreshToken &&
    typeof candidate.accessTokenExpiresIn === 'number' &&
    typeof candidate.refreshTokenExpiresIn === 'number'
  ) {
    return {
      accessToken: candidate.accessToken,
      refreshToken: candidate.refreshToken,
      accessTokenExpiresIn: candidate.accessTokenExpiresIn,
      refreshTokenExpiresIn: candidate.refreshTokenExpiresIn,
    };
  }
  return undefined;
}

function normaliseViewContent(content: unknown, viewType: VNextViewType): Record<string, unknown> {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  // For string-bodied view types (html/markdown) wrap into a uniform shape so
  // downstream consumers always see an object.
  return { type: viewType, body: content };
}

