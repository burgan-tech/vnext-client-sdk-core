/**
 * Build the dependency graph for `WorkflowManager`. No DI container — plain
 * constructor injection in topological order.
 */

import { ApiDataLoader, ApiSchemaLoader, ApiViewLoader } from '../services/loaders/index.js';
import { DefaultEndpointResolver } from '../services/endpoint-resolver.js';
import { WorkflowApiService } from '../services/workflow-api-service.js';
import { ViewHandlerRegistry } from '../handlers/view-handler-registry.js';
import { HttpViewHandler } from '../handlers/http-view-handler.js';
import { DeepLinkViewHandler } from '../handlers/deeplink-view-handler.js';
import { URNViewHandler } from '../handlers/urn-view-handler.js';
import { StateManager } from '../managers/state-manager.js';
import { ViewCacheManager } from '../managers/view-manager.js';
import { DataManager } from '../managers/data-manager.js';
import { SchemaManager } from '../managers/schema-manager.js';
import { LongPollingManager } from '../managers/long-polling-manager.js';
import { AwaitingTransitionsManager } from '../managers/awaiting-transitions.js';
import { WorkflowStateProcessor } from '../managers/workflow-state-processor.js';
import { ParameterBinder } from '../utils/parameter-binder.js';
import { EventEmitter } from './event-emitter.js';
import type {
  ContinueWorkflowInput,
  ContinueWorkflowResult,
  StartTransitionInput,
  StartTransitionResult,
  StartWorkflowInput,
  StartWorkflowResult,
  WorkflowEventMap,
} from '../types.js';
import type { ResolvedOptions } from './resolve-options.js';

export interface ComposedDependencies {
  options: ResolvedOptions;
  events: EventEmitter<WorkflowEventMap>;
  api: WorkflowApiService;
  stateManager: StateManager;
  viewCache: ViewCacheManager;
  dataManager: DataManager;
  schemaManager: SchemaManager;
  longPolling: LongPollingManager;
  awaiting: AwaitingTransitionsManager;
  processor: WorkflowStateProcessor;
  handlerRegistry: ViewHandlerRegistry;
  parameterBinder: ParameterBinder;
}

export interface FacadeBindings {
  startWorkflow: (input: StartWorkflowInput) => Promise<StartWorkflowResult>;
  startTransition: (input: StartTransitionInput) => Promise<StartTransitionResult>;
  continueWorkflow: (input: ContinueWorkflowInput) => Promise<ContinueWorkflowResult>;
}

export function compose(options: ResolvedOptions): ComposedDependencies {
  const events = new EventEmitter<WorkflowEventMap>();

  const resolver = options.endpointResolver ?? new DefaultEndpointResolver();

  const api = new WorkflowApiService({
    http: options.http,
    resolver,
    defaultRequestTimeoutMs: options.defaultRequestTimeoutMs,
  });

  // loaders — defaults reference the api
  const dataLoader = options.dataLoader ?? new ApiDataLoader(api, { defaultExtensions: options.extensions });
  const viewLoader = options.viewLoader ?? new ApiViewLoader(api);
  const schemaLoader = options.schemaLoader ?? new ApiSchemaLoader(api);

  const stateManager = new StateManager();
  const viewCache = new ViewCacheManager();
  const dataManager = new DataManager({ loader: dataLoader, ...(options.onLog ? { onLog: options.onLog } : {}) });
  const schemaManager = new SchemaManager({ loader: schemaLoader, ...(options.onLog ? { onLog: options.onLog } : {}) });

  const handlerRegistry = new ViewHandlerRegistry();
  const parameterBinder = new ParameterBinder({
    ...(options.parameterRegistry ? { registry: options.parameterRegistry } : {}),
    strategy: 'throwError',
  });

  const longPolling = new LongPollingManager({ timer: options.timer });
  const awaiting = new AwaitingTransitionsManager();

  const processor = new WorkflowStateProcessor({
    stateManager,
    viewCache,
    dataManager,
    viewLoader,
    handlerRegistry,
    events,
    ...(options.onLog ? { onLog: options.onLog } : {}),
  });

  return {
    options,
    events,
    api,
    stateManager,
    viewCache,
    dataManager,
    schemaManager,
    longPolling,
    awaiting,
    processor,
    handlerRegistry,
    parameterBinder,
  };
}

/** Wire the default view handlers and any user-supplied additions. */
export function bindHandlers(deps: ComposedDependencies, facade: FacadeBindings): void {
  const { handlerRegistry, options, parameterBinder } = deps;

  if (options.launchUrl) {
    handlerRegistry.register(new HttpViewHandler({ launchUrl: options.launchUrl, parameterBinder }));
  }
  if (options.navigateDeepLink) {
    handlerRegistry.register(new DeepLinkViewHandler({ navigateDeepLink: options.navigateDeepLink, parameterBinder }));
  }

  handlerRegistry.register(
    new URNViewHandler({
      startWorkflow: facade.startWorkflow,
      startTransition: facade.startTransition,
      continueWorkflow: facade.continueWorkflow,
      defaultVersion: options.defaultVersion,
      ...(options.parameterRegistry ? { parameterRegistry: options.parameterRegistry } : {}),
      parameterBinder,
    }),
  );

  if (options.viewHandlers) handlerRegistry.registerAll(options.viewHandlers);
}
