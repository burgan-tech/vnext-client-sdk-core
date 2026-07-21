/**
 * Public type definitions for `amorphie-workflow-manager`.
 *
 * This file mirrors `docs/workflow-manager-interface.md` §3–§13 verbatim. Class
 * declarations live in their own modules; this file contains only `interface`,
 * `type`, and shared enum literals.
 */

import type { MorphClient } from '@morph/core';

// ============================================================================
// 0. Common helpers
// ============================================================================

/**
 * Common error envelope returned by every Result type. Backend RFC-7807
 * `ProblemDetails` payloads are parsed into `problem`. Network/parse failures
 * surface via `code` (`'network' | 'parse' | 'timeout' | 'disposed' | …`).
 */
export interface WorkflowErrorPayload {
  code?: string;
  message?: string;
  body?: unknown;
  cause?: unknown;
  problem?: ProblemDetails;
  validationErrors?: ValidationError[];
}

// ============================================================================
// 1. Enum literals
// ============================================================================

export type VNextInstanceStatus = 'busy' | 'active' | 'passive' | 'completed' | 'faulted';

export type VNextStateType = 'initial' | 'intermediate' | 'finish' | 'subFlow' | 'wizard';

export type VNextStateSubType =
  | 'none'
  | 'success'
  | 'error'
  | 'terminated'
  | 'suspended'
  | 'busy'
  | 'human'
  | 'cancelled'
  | 'timeout';

export type VNextViewType = 'json' | 'html' | 'markdown' | 'http' | 'deepLink' | 'urn';

export type VNextViewDisplayMode =
  | 'full-page'
  | 'popup'
  | 'bottom-sheet'
  | 'top-sheet'
  | 'drawer'
  | 'inline';

export type NeoNavigationType = 'push' | 'pushReplacement' | 'pop' | 'popup' | 'bottomSheet';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'nin'
  | 'like'
  | 'startswith'
  | 'endswith';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ============================================================================
// 2. Backend DTOs (vNext)
// ============================================================================

export interface ValidationError {
  message: string;
  members?: string[];
  path?: string;
  keyword?: string;
  code?: string;
}

/** RFC 7807 `ProblemDetails` — error envelope returned by the runtime. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

/**
 * SDK-internal cached state — what `getStateByWorkflowName()` returns.
 * Backed by the `state` instance function response, optionally enriched with
 * envelope metadata (`effectiveState*`, `flowVersion`).
 */
export interface VNextState {
  workflowName: string;
  domain: string;
  instanceId: string;
  currentState: string;
  effectiveState?: string;
  stateType?: VNextStateType;
  stateSubType?: VNextStateSubType;
  status: VNextInstanceStatus;
  data: VNextData;
  view: VNextView | null;
  transitions: VNextAvailableTransition[];
  activeCorrelations: VNextStateCorrelation[];
  eTag?: string;
  entityEtag?: string;
  flowVersion?: string;
}

/** Raw `GET /instances/{instanceIdOrKey}` envelope. */
export interface VNextGetInstanceResponse {
  id: string;
  key?: string;
  flow?: string;
  domain?: string;
  flowVersion?: string;
  eTag?: string;
  entityEtag?: string;
  tags?: string[];
  metadata: VNextInstanceMetadata;
  attributes?: unknown;
  extensions?: Record<string, unknown>;
}

export interface VNextInstanceMetadata {
  currentState?: string;
  effectiveState?: string;
  /**
   * Wire-format status. May arrive as a single-letter code (`'A'`/`'B'`/…) or
   * a full name (`'Active'`/`'Busy'`/…). Parser converts both to enum literals.
   */
  status: string;
  effectiveStateType?: VNextStateType;
  effectiveStateSubType?: VNextStateSubType;
  completedAt?: string;
  duration?: number;
  createdAt: string;
  modifiedAt?: string;
  createdBy?: string;
  createdByBehalfOf?: string;
  modifiedBy?: string;
  modifiedByBehalfOf?: string;
}

/**
 * Raw `state` instance function response — the long-polling primary endpoint.
 * Status arrives as a string; the parser converts to `VNextInstanceStatus`.
 */
export interface VNextStateFunctionResponse {
  state: string;
  /** State type when the backend includes it on the state response (e.g. `wizard`). */
  stateType?: VNextStateType;
  status: string;
  data: { href: string };
  view: { hasView: boolean; href: string; loadData: boolean };
  transitions: VNextAvailableTransition[];
  activeCorrelations: VNextStateCorrelation[];
  /** Snapshot ETag (HTTP `etag` header / body `eTag`). */
  eTag: string;
  /** Entity-level ETag (HTTP `x-entity-etag` header / body `entityEtag`). */
  entityEtag?: string;
}

export interface VNextData {
  data: Record<string, unknown>;
  extensions: Record<string, unknown>;
  eTag?: string;
  entityEtag?: string;
}

export interface VNextView {
  pageId: string;
  content: Record<string, unknown>;
  displayType: VNextViewDisplayMode;
  viewType: VNextViewType;
}

/** Raw view fetch response from the `view` instance function. */
export interface VNextViewResponse {
  key: string;
  content: unknown;
  type: string;
  display: string;
  label: string;
}

export interface VNextAvailableTransition {
  /** Transition key (backend wire field is `name`). */
  key: string;
  view: VNextAvailableTransitionView;
  schema: VNextAvailableTransitionSchema;
  href?: string;
}

export interface VNextAvailableTransitionView {
  hasView: boolean;
  loadData: boolean;
  href?: string;
}

export interface VNextAvailableTransitionSchema {
  hasSchema: boolean;
  href?: string;
}

export interface VNextStateCorrelation {
  correlationId: string;
  parentState: string;
  subFlowInstanceId: string;
  /** Pass-through wire string (often single letter, e.g. `'P'`). */
  subFlowType: string;
  subFlowDomain: string;
  subFlowName: string;
  subFlowVersion?: string;
  isCompleted: boolean;
  href?: string;
  status?: string;
  currentState?: string;
}

export interface VNextViewReference {
  key: string;
  version: string;
  domain: string;
  flow: string;
  flowVersion: string;
}

export interface VNextTransitionSchema {
  key: string;
  type: string;
  schema: Record<string, unknown>;
}

/** Parsed query response item. */
export interface VNextInstanceSnapshot {
  id: string;
  key?: string;
  /** Backend wire field is `flow`/`workflow`; SDK uses `name` consistently. */
  name: string;
  domain: string;
  status: VNextInstanceStatus;
  currentState?: string;
  attributes: unknown;
  flowVersion?: string;
  tags?: string[];
  createdAt: string;
  modifiedAt?: string;
}

/** HAL-style pagination links. Empty `next`/`prev` strings indicate end/start. */
export interface VNextPaginationLinks {
  self: string;
  first: string;
  next: string;
  prev: string;
  /** Link to the last page. Optional — not every backend envelope includes it. */
  last?: string;
}

// ============================================================================
// 3. Lifecycle Input / Result
// ============================================================================

export interface StartWorkflowInput {
  domain: string;
  name: string;
  version?: string;
  /** Backend `key` — optional idempotency / business key. */
  key?: string;
  attributes?: Record<string, unknown>;
  tags?: string[];
  instanceId?: string;
  sync?: boolean;
  extensions?: string[];
  displayLoading?: boolean;
}

export interface StartWorkflowResult {
  ok: boolean;
  instanceId?: string;
  eTag?: string;
  status?: VNextInstanceStatus;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

export interface StartTransitionInput {
  domain: string;
  name: string;
  transitionKey: string;
  /** Optional — wrapped into `{ attributes: body }` envelope by the service layer. */
  body?: Record<string, unknown>;
  key?: string;
  tags?: string[];
  /** UUID or business key. */
  instanceId?: string;
  version?: string;
  sync?: boolean;
  extensions?: string[];
  headerParameters?: Record<string, string>;
  displayLoading?: boolean;
}

export interface StartTransitionResult {
  ok: boolean;
  instanceId?: string;
  status?: VNextInstanceStatus;
  eTag?: string;
  awaitingConfirmation?: boolean;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

export interface RetryWorkflowInput {
  domain: string;
  name: string;
  /** UUID or business key. */
  instanceId: string;
  attributes?: Record<string, unknown>;
  key?: string;
  tags?: string[];
  version?: string;
  sync?: boolean;
  displayLoading?: boolean;
}

export interface RetryWorkflowResult {
  ok: boolean;
  instanceId?: string;
  /** Required when `ok=true`; undefined on error path. */
  retriedTransitionId?: string;
  status?: VNextInstanceStatus;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

export interface ContinueWorkflowInput {
  domain: string;
  name: string;
  /** UUID or business key. */
  instanceId: string;
  version?: string;
  extensions?: string[];
  displayLoading?: boolean;
}

export interface ContinueWorkflowResult {
  ok: boolean;
  instanceId?: string;
  status?: VNextInstanceStatus;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

// ============================================================================
// 4. Function call Input / Result
// ============================================================================

export interface DomainFunctionInput {
  domain: string;
  functionName: string;
  version?: string;
  queryParameters?: Record<string, string>;
  displayLoading?: boolean;
}

export interface InstanceFunctionInput {
  domain: string;
  name: string;
  /** UUID or business key. */
  instanceId: string;
  functionName: string;
  version?: string;
  extensions?: string[];
  transitionKey?: string;
  role?: string;
  functionKey?: string;
  queryRoles?: boolean;
  ifNoneMatch?: string;
  queryParameters?: Record<string, string>;
  displayLoading?: boolean;
}

export interface FunctionCallResult {
  ok: boolean;
  data: Record<string, unknown> | null;
  eTag?: string;
  notModified?: boolean;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

// ============================================================================
// 5. Query / Filter / Sort
// ============================================================================

export interface QueryInstancesInput {
  domain: string;
  name: string;
  /**
   * Single field, three accepted shapes:
   *  - `VNextFilter[]` → SDK serializes to JSON object DSL
   *    (`filter={"<field>":{"<op>":<v>}}`, multi = AND).
   *  - `VNextFilterOrGroup` → wraps as `{"or": [...]}`.
   *  - `string` → raw JSON DSL passed through with URL-encoding.
   */
  filter?: VNextFilter[] | VNextFilterOrGroup | string;
  /** Single field or list. Backend accepts both. */
  sort?: VNextSort | VNextSort[];
  page?: number;
  pageSize?: number;
  version?: string;
  extensions?: string[];
}

export interface QueryInstancesResult {
  ok: boolean;
  items: VNextInstanceSnapshot[];
  links: VNextPaginationLinks;
  raw: Record<string, unknown>;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

/**
 * Result of `WorkflowManager.getInstance()`. Carries the full envelope as
 * defined in `backend-api.md` §2.4: metadata, attributes, extensions, ETags.
 *
 * The SDK does NOT seed the polling cache from this call — it's a one-shot
 * read intended for detail screens, exports, debugging. Use
 * `continueWorkflow()` if you also want polling to start.
 */
export interface GetInstanceInput {
  domain: string;
  name: string;
  instanceId: string;
  /** Optional pinned definition version. */
  version?: string;
  /** Names of host extensions to bundle into the response. */
  extensions?: string[];
  /** Conditional fetch — returns `notModified: true` when ETag matches. */
  ifNoneMatch?: string;
}

export interface GetInstanceResult {
  ok: boolean;
  /** The full parsed envelope when `ok` and the body wasn't 304. */
  instance: VNextGetInstanceResponse | null;
  /** True when backend returned 304 Not Modified for the supplied `ifNoneMatch`. */
  notModified?: boolean;
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

export interface VNextFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
  /**
   * When true the filter is grouped under `attributes`:
   *   `{"attributes":{"<field>":{"<op>":value}}}`
   */
  isAttribute?: boolean;
}

export interface VNextFilterOrGroup {
  or: VNextFilter[];
}

export interface VNextSort {
  field: string;
  direction: 'asc' | 'desc';
}

// ============================================================================
// 6. Transition history (debug / audit)
// ============================================================================

export interface GetTransitionHistoryInput {
  domain: string;
  name: string;
  /** UUID or business key. */
  instanceId: string;
}

export interface GetTransitionHistoryResult {
  ok: boolean;
  transitions: VNextTransitionHistoryEntry[];
  statusCode?: number;
  error?: WorkflowErrorPayload;
}

export interface VNextTransitionHistoryEntry {
  /** Transition execution UUID. */
  id: string;
  /** Transition definition key (wire field is `transitionId`). */
  transitionKey: string;
  fromState: string;
  toState: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  triggerType: 'manual' | 'automatic';
  body: Record<string, unknown>;
  header: Record<string, string>;
  createdAt: string;
}

// ============================================================================
// 7. Auth / Token
// ============================================================================

/** Auth-refresh signal — the workflow data extensionToken block. */
export interface ExtensionToken {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

// ============================================================================
// 8. Delegates (callbacks)
// ============================================================================

export type OnLog = (
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) => void;

export type OnLoadingChanged = (event: { displayLoading: boolean }) => void;

export interface VNextPageContext {
  instanceId: string;
  workflowName: string;
  workflowDomain: string;
  workflowVersion: string;
}

export interface NavigationRequest {
  pageContext: VNextPageContext;
  navigationPath: string;
  navigationType: NeoNavigationType;
  /** Original backend display mode for host-side fine-tuning. */
  displayMode?: VNextViewDisplayMode;
  initialData?: Record<string, unknown>;
  hasView: boolean;
}

export type OnNavigate = (event: NavigationRequest) => void;

export interface TransitionErrorEvent extends WorkflowErrorPayload {
  statusCode?: number;
}

export type OnTransitionError = (event: TransitionErrorEvent) => void;

export type OnTokenRefresh = (token: ExtensionToken) => void;

export type LaunchUrl = (url: string) => Promise<boolean>;

export type NavigateDeepLink = (url: string) => Promise<void>;

// ============================================================================
// 9. HTTP Delegate
// ============================================================================

export interface HttpRequest {
  method: HttpMethod;
  /**
   * Host-relative path produced by `EndpointResolver` (`/{domain}/...`, without
   * any API prefix). The SDK never builds absolute URLs — base-URL composition,
   * including any `/api/v1` prefix, is the delegate's responsibility (e.g.
   * `MorphHttpDelegate` resolves through `host.request`).
   */
  path: string;
  /**
   * Query parameters appended to `path`. Repeat-key (e.g. `?extensions=a&extensions=b`)
   * is expressed as an array value. The SDK does not URL-encode upstream; the
   * delegate must encode and merge with any pre-encoded query already on `path`.
   */
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Opaque metadata for the delegate (target host, auth scope, …). */
  meta?: { hostKey?: string; authId?: string; [k: string]: unknown };
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  data: T | null;
}

export interface HttpDelegate {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

// ============================================================================
// 10. Loaders (interfaces only — implementations under services/loaders/)
// ============================================================================

/** Uniform return envelope for every loader; manager layer handles 304 once. */
export interface LoaderResult<T> {
  data: T | null;
  eTag?: string;
  /** True when the backend returned `304 Not Modified` (cache copy is valid). */
  notModified?: boolean;
}

export interface DataLoader {
  loadData(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    stateName: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<Record<string, unknown>> | null>;
}

export interface ViewLoader {
  loadViewByReference(input: {
    viewRef: VNextViewReference;
    instanceId: string;
    transitionKey?: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<VNextViewResponse> | null>;
}

export interface SchemaLoader {
  loadSchema(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
    ifNoneMatch?: string;
  }): Promise<LoaderResult<Record<string, unknown>> | null>;
}

// ============================================================================
// 11. View handlers / filters
// ============================================================================

export interface ViewHandler {
  /** Single discriminator used by the registry to pick a handler. */
  readonly viewType: VNextViewType;
  handle(view: VNextView, context: Record<string, unknown>): Promise<ViewHandlerResult>;
}

export interface ViewHandlerResult {
  success: boolean;
  view?: VNextView;
  error?: Error;
  message?: string;
}

export interface TransitionBodyFilter {
  filterTransitionBody(input: {
    workflowDomain: string;
    workflowName: string;
    instanceId: string;
    transitionKey: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

// ============================================================================
// 12. Endpoint resolver
// ============================================================================

export type WorkflowOperation =
  | 'startInstance'
  | 'transition'
  | 'retry'
  | 'getInstance'
  | 'getInstanceState'
  | 'queryInstances'
  | 'getTransitionHistory'
  | 'domainFunction'
  | 'instanceFunction';

export interface EndpointResolution {
  method: HttpMethod;
  path: string;
}

export interface EndpointResolver {
  resolve(operation: WorkflowOperation, params: Record<string, string>): EndpointResolution;
}

// ============================================================================
// 13. Parameter registry
// ============================================================================

export interface ParameterRegistry {
  /** Returns the value for `key`, or `undefined` if not set. */
  getValue(key: string): unknown;
}

// ============================================================================
// 14. Timer abstraction
// ============================================================================

export type TimerHandle = number | object;

export interface Timer {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  now(): number;
}

// ============================================================================
// 15. Long polling + workflow config
// ============================================================================

export interface LongPollingConfig {
  /** Wait between two ticks in busy state (seconds). Default: 4. */
  intervalSeconds: number;
  /** Maximum total polling duration (seconds). Default: 60. */
  durationSeconds: number;
  /** Per-call HTTP timeout (seconds). Default: 30. */
  timeoutSeconds: number;
  /** When true the SDK sends `If-None-Match`. Default: true. */
  useETag?: boolean;
}

export interface WorkflowConfig {
  domain: string;
  name: string;
  version: string;
  longPollingConfig?: LongPollingConfig;
}

// ============================================================================
// 16. WorkflowManagerOptions (root config)
// ============================================================================

export interface WorkflowManagerOptions {
  /** Required HTTP delegate. Default adapter: `new MorphHttpDelegate(...)`. */
  http: HttpDelegate;

  /**
   * Optional client-side platform tag. Backend does NOT accept `?platform=`;
   * the SDK only carries this for logging / view-renderer hand-off.
   */
  platform?: 'web' | 'ios' | 'android';

  /** Configured workflows — domain/name/version + per-flow polling config. */
  workflows?: WorkflowConfig[];

  defaultLongPollingConfig?: LongPollingConfig;

  /** Default workflow version when not provided per-call. Default: `'1.0.0'`. */
  defaultVersion?: string;

  /** `?sync=` value for start. Default: false. */
  syncStart?: boolean;
  /** `?sync=` value for transition. Default: false. */
  syncTransition?: boolean;
  /** `?sync=` value for retry. Default: false. */
  syncRetry?: boolean;

  /** Global named-extension keys (per-call override available). */
  extensions?: string[];

  /** Per-request HTTP timeout (ms). Default: 30000. */
  defaultRequestTimeoutMs?: number;

  /** Default for `loadingChanged` emission on lifecycle calls. Default: true. */
  displayLoadingByDefault?: boolean;

  // ---- callback delegates ----
  onLog?: OnLog;
  onLoadingChanged?: OnLoadingChanged;
  onNavigate?: OnNavigate;
  onTransitionError?: OnTransitionError;
  onTokenRefresh?: OnTokenRefresh;
  launchUrl?: LaunchUrl;
  navigateDeepLink?: NavigateDeepLink;

  // ---- pluggable infra ----
  parameterRegistry?: ParameterRegistry;
  endpointResolver?: EndpointResolver;
  dataLoader?: DataLoader;
  viewLoader?: ViewLoader;
  schemaLoader?: SchemaLoader;
  transitionBodyFilter?: TransitionBodyFilter;
  viewHandlers?: ViewHandler[];
  /** Time-source abstraction for tests. Defaults to native `setTimeout`/`Date.now`. */
  timer?: Timer;
}

// ============================================================================
// 17. Event map + subscription handle
// ============================================================================

export interface WorkflowEventMap {
  loadingChanged: { displayLoading: boolean };

  navigationRequested: NavigationRequest;

  transitionError: TransitionErrorEvent;

  tokenRefreshRequested: ExtensionToken;

  stateChanged: {
    workflowName: string;
    instanceId: string;
    state: string;
    status: VNextInstanceStatus;
    stateType?: VNextStateType;
    stateSubType?: VNextStateSubType;
  };

  viewActionFailed: {
    viewType: VNextViewType;
    error: unknown;
    message?: string;
  };

  pollingStarted: {
    workflowName: string;
    instanceId: string;
  };

  pollingStopped: {
    workflowName: string;
    instanceId: string;
    reason: 'completed' | 'faulted' | 'timeout' | 'disposed' | 'terminated' | 'stable';
  };

  /** ETag matched, body unchanged — debug/observability signal. */
  pollingNotModified: {
    workflowName: string;
    instanceId: string;
  };
}

export interface Subscription {
  unsubscribe(): void;
}

// ============================================================================
// 18. Re-exported third-party types (for public consumers)
// ============================================================================

export type { MorphClient };
