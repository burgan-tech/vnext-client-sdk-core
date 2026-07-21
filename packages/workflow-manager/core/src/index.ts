/**
 * Public surface of `amorphie-workflow-manager`.
 *
 * Exports listed in `docs/workflow-manager-interface.md` §15 verbatim.
 * Internal symbols (managers, runtime helpers, parsers) are NOT re-exported
 * from this entrypoint.
 */

// ----- Facade -----
export { WorkflowManager } from './workflow-manager.js';

// ----- HTTP delegates -----
export { MorphHttpDelegate } from './http/morph-http-delegate.js';

// ----- Loaders (defaults + interfaces re-exported via types) -----
export { ApiDataLoader, ApiViewLoader, ApiSchemaLoader } from './services/loaders/index.js';

// ----- View handlers + registry helper -----
export {
  HttpViewHandler,
  DeepLinkViewHandler,
  URNViewHandler,
  ViewHandlerRegistry,
} from './handlers/index.js';

// ----- Body filters -----
export { NoOpBodyFilter, SchemaBasedBodyFilter } from './filters/index.js';
export type { SchemaProvider } from './filters/index.js';

// ----- Endpoint resolver -----
export { DefaultEndpointResolver } from './services/endpoint-resolver.js';

// ----- Pure utilities (consumers can use directly) -----
export { URNParser } from './utils/urn-parser.js';
export type { ParsedURN } from './utils/urn-parser.js';
export { ParameterBinder } from './utils/parameter-binder.js';
export type { MissingStrategy, ParameterBinderOptions } from './utils/parameter-binder.js';
export { SchemaFilter } from './utils/schema-filter.js';
export { DefaultTimer } from './utils/timer.js';
export {
  pickETags,
  withIfNoneMatch,
  is304,
  type PickedETags,
} from './utils/etag.js';

// ----- Enum helpers -----
export {
  instanceStatusFromWire,
  stateTypeFromWire,
  stateSubTypeFromWire,
  viewTypeFromWire,
  displayModeFromWire,
  displayModeToNavigationType,
} from './enums.js';

// ----- Errors -----
export {
  WorkflowManagerError,
  HttpError,
  MalformedURNError,
  ParameterBindingError,
  ViewHandlerError,
  ViewContentParseError,
  PollingTimeoutError,
} from './errors.js';

// ----- All public types (DTOs, Input/Result, delegates, events, …) -----
export type {
  // ---- common
  WorkflowErrorPayload,
  ValidationError,
  ProblemDetails,

  // ---- enum literals
  VNextInstanceStatus,
  VNextStateType,
  VNextStateSubType,
  VNextViewType,
  VNextViewDisplayMode,
  NeoNavigationType,
  LogLevel,
  FilterOperator,
  HttpMethod,

  // ---- backend DTOs
  VNextState,
  VNextGetInstanceResponse,
  VNextInstanceMetadata,
  VNextStateFunctionResponse,
  VNextData,
  VNextView,
  VNextViewResponse,
  VNextAvailableTransition,
  VNextAvailableTransitionView,
  VNextAvailableTransitionSchema,
  VNextStateCorrelation,
  VNextViewReference,
  VNextTransitionSchema,
  VNextInstanceSnapshot,
  VNextPaginationLinks,

  // ---- lifecycle inputs / results
  StartWorkflowInput,
  StartWorkflowResult,
  StartTransitionInput,
  StartTransitionResult,
  RetryWorkflowInput,
  RetryWorkflowResult,
  ContinueWorkflowInput,
  ContinueWorkflowResult,

  // ---- function inputs / results
  DomainFunctionInput,
  InstanceFunctionInput,
  FunctionCallResult,

  // ---- one-shot envelope read
  GetInstanceInput,
  GetInstanceResult,
  GetWorkflowStatesInput,
  GetWorkflowStatesResult,
  WorkflowStateInfo,

  // ---- query / filter
  QueryInstancesInput,
  QueryInstancesResult,
  VNextFilter,
  VNextFilterOrGroup,
  VNextSort,

  // ---- transition history
  GetTransitionHistoryInput,
  GetTransitionHistoryResult,
  VNextTransitionHistoryEntry,

  // ---- auth
  ExtensionToken,

  // ---- delegates
  OnLog,
  OnLoadingChanged,
  OnNavigate,
  OnTransitionError,
  OnTokenRefresh,
  LaunchUrl,
  NavigateDeepLink,
  NavigationRequest,
  TransitionErrorEvent,
  VNextPageContext,

  // ---- HTTP
  HttpRequest,
  HttpResponse,
  HttpDelegate,

  // ---- loaders / handlers / filters
  LoaderResult,
  DataLoader,
  ViewLoader,
  SchemaLoader,
  ViewHandler,
  ViewHandlerResult,
  TransitionBodyFilter,

  // ---- resolver / parameters
  EndpointResolution,
  EndpointResolver,
  WorkflowOperation,
  ParameterRegistry,

  // ---- timer
  Timer,
  TimerHandle,

  // ---- options + events
  LongPollingConfig,
  WorkflowConfig,
  WorkflowManagerOptions,
  WorkflowEventMap,
  Subscription,
} from './types.js';

// ----- Re-exported third-party type for consumers wiring MorphHttpDelegate -----
export type { MorphClient } from './types.js';
