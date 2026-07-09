/**
 * Thin orchestration layer over an `HttpDelegate` and an `EndpointResolver`.
 *
 * Responsibilities:
 *  - Build endpoint URLs via the resolver.
 *  - Wrap transition/start request bodies into the canonical `{ key?, tags?, attributes }` envelope.
 *  - Serialise repeat-key query parameters (`extensions=a&extensions=b`).
 *  - Honour `If-None-Match` for ETag-cached endpoints.
 *  - Normalise `304 Not Modified` so callers get a uniform "no change" signal.
 *
 * This service is **endpoint-shaped**: each method maps 1:1 onto a backend
 * endpoint and returns a raw `HttpResponse<T>`. The actual DTO parsing and
 * domain logic lives in the manager layer.
 */

import type {
  EndpointResolver,
  HttpDelegate,
  HttpRequest,
  HttpResponse,
  StartTransitionInput,
  StartWorkflowInput,
  WorkflowOperation,
} from '../types.js';
import { withIfNoneMatch } from '../utils/etag.js';

const PASCAL_CASE_QUERY_KEYS: ReadonlySet<string> = new Set([
  'Version',
  'Extensions',
  'TransitionKey',
  'Role',
  'FunctionKey',
  'QueryRoles',
]);

export interface WorkflowApiServiceOptions {
  http: HttpDelegate;
  resolver: EndpointResolver;
  /** Default request timeout in milliseconds. */
  defaultRequestTimeoutMs?: number;
  /** Optional opaque metadata applied to every outgoing request (host/auth keys). */
  defaultRequestMeta?: HttpRequest['meta'];
}

interface CallParams {
  operation: WorkflowOperation;
  pathParams: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  ifNoneMatch?: string;
  timeoutMs?: number;
  meta?: HttpRequest['meta'];
}

export class WorkflowApiService {
  private readonly http: HttpDelegate;
  private readonly resolver: EndpointResolver;
  private readonly defaultRequestTimeoutMs?: number;
  private readonly defaultRequestMeta?: HttpRequest['meta'];

  constructor(opts: WorkflowApiServiceOptions) {
    this.http = opts.http;
    this.resolver = opts.resolver;
    if (opts.defaultRequestTimeoutMs !== undefined) {
      this.defaultRequestTimeoutMs = opts.defaultRequestTimeoutMs;
    }
    if (opts.defaultRequestMeta !== undefined) {
      this.defaultRequestMeta = opts.defaultRequestMeta;
    }
  }

  // ==========================================================================
  // generic dispatcher
  // ==========================================================================

  async call<T = unknown>(params: CallParams): Promise<HttpResponse<T>> {
    const resolution = this.resolver.resolve(params.operation, params.pathParams);

    const headers = withIfNoneMatch(params.headers, params.ifNoneMatch);

    const request: HttpRequest = {
      method: resolution.method,
      path: resolution.path,
      ...(params.query && Object.keys(params.query).length > 0 ? { query: params.query } : {}),
      ...(headers ? { headers } : {}),
      ...(params.body !== undefined ? { body: params.body } : {}),
      timeoutMs: params.timeoutMs ?? this.defaultRequestTimeoutMs ?? 30_000,
      ...(params.meta || this.defaultRequestMeta
        ? { meta: { ...(this.defaultRequestMeta ?? {}), ...(params.meta ?? {}) } }
        : {}),
    };

    return this.http.request<T>(request);
  }

  // ==========================================================================
  // lifecycle
  // ==========================================================================

  startInstance(input: StartWorkflowInput, opts: { sync?: boolean; defaultExtensions?: string[] }): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'startInstance',
      pathParams: { domain: input.domain, name: input.name },
      query: buildLifecycleQuery({
        version: input.version,
        sync: opts.sync ?? input.sync,
        extensions: input.extensions ?? opts.defaultExtensions,
      }),
      body: wrapEnvelope({
        key: input.key,
        tags: input.tags,
        attributes: input.attributes ?? {},
      }),
    });
  }

  transition(
    input: StartTransitionInput,
    opts: { instanceIdOrKey: string; sync?: boolean; defaultExtensions?: string[] },
  ): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'transition',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: opts.instanceIdOrKey,
        transitionKey: input.transitionKey,
      },
      query: buildLifecycleQuery({
        version: input.version,
        sync: opts.sync ?? input.sync,
        extensions: input.extensions ?? opts.defaultExtensions,
      }),
      headers: input.headerParameters,
      body: wrapEnvelope({
        key: input.key,
        tags: input.tags,
        attributes: input.body,
      }),
    });
  }

  retry(
    input: { domain: string; name: string; instanceIdOrKey: string; sync?: boolean; body?: unknown },
  ): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'retry',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceIdOrKey,
      },
      query: buildLifecycleQuery({ sync: input.sync }),
      body: input.body ?? {},
    });
  }

  // ==========================================================================
  // reads
  // ==========================================================================

  getInstance(input: {
    domain: string;
    name: string;
    instanceIdOrKey: string;
    version?: string;
    extensions?: string[];
    ifNoneMatch?: string;
  }): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'getInstance',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceIdOrKey,
      },
      query: buildLifecycleQuery({
        version: input.version,
        extensions: input.extensions,
      }),
      ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
    });
  }

  getInstanceState(input: {
    domain: string;
    name: string;
    instanceIdOrKey: string;
    ifNoneMatch?: string;
    timeoutMs?: number;
  }): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'getInstanceState',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceIdOrKey,
      },
      ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    });
  }

  queryInstances(input: {
    domain: string;
    name: string;
    filter?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
    version?: string;
    extensions?: string[];
  }): Promise<HttpResponse<unknown>> {
    const query: Record<string, string | string[] | undefined> = {};
    if (input.filter !== undefined) query.filter = input.filter;
    if (input.sort !== undefined) query.sort = input.sort;
    if (input.page !== undefined) query.page = String(input.page);
    if (input.pageSize !== undefined) query.pageSize = String(input.pageSize);
    if (input.version !== undefined) query.version = input.version;
    if (input.extensions && input.extensions.length > 0) query.extensions = input.extensions;

    return this.call({
      operation: 'queryInstances',
      pathParams: { domain: input.domain, name: input.name },
      query,
    });
  }

  getTransitionHistory(input: {
    domain: string;
    name: string;
    instanceIdOrKey: string;
  }): Promise<HttpResponse<unknown>> {
    return this.call({
      operation: 'getTransitionHistory',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceIdOrKey,
      },
    });
  }

  // ==========================================================================
  // function calls
  // ==========================================================================

  domainFunction(input: {
    domain: string;
    functionName: string;
    version?: string;
    queryParameters?: Record<string, string>;
  }): Promise<HttpResponse<unknown>> {
    const query: Record<string, string | string[] | undefined> = {
      ...(input.queryParameters ?? {}),
    };
    if (input.version !== undefined) query.version = input.version;
    return this.call({
      operation: 'domainFunction',
      pathParams: { domain: input.domain, functionName: input.functionName },
      query,
    });
  }

  instanceFunction(input: {
    domain: string;
    name: string;
    instanceIdOrKey: string;
    functionName: string;
    version?: string;
    extensions?: string[];
    transitionKey?: string;
    role?: string;
    functionKey?: string;
    queryRoles?: boolean;
    ifNoneMatch?: string;
    queryParameters?: Record<string, string>;
  }): Promise<HttpResponse<unknown>> {
    const query: Record<string, string | string[] | undefined> = {
      ...(input.queryParameters ?? {}),
    };
    if (input.version !== undefined) query.Version = input.version;
    if (input.extensions && input.extensions.length > 0) query.Extensions = input.extensions;
    if (input.transitionKey !== undefined) query.TransitionKey = input.transitionKey;
    if (input.role !== undefined) query.Role = input.role;
    if (input.functionKey !== undefined) query.FunctionKey = input.functionKey;
    if (input.queryRoles !== undefined) query.QueryRoles = String(input.queryRoles);

    // Strip any lowercase duplicates the consumer may have added so the wire
    // payload uses a single PascalCase form per parameter.
    for (const key of Object.keys(query)) {
      const pascal = pascalize(key);
      if (pascal !== key && PASCAL_CASE_QUERY_KEYS.has(pascal) && query[pascal] !== undefined) {
        delete query[key];
      }
    }

    return this.call({
      operation: 'instanceFunction',
      pathParams: {
        domain: input.domain,
        name: input.name,
        instanceIdOrKey: input.instanceIdOrKey,
        functionName: input.functionName,
      },
      query,
      ...(input.ifNoneMatch !== undefined ? { ifNoneMatch: input.ifNoneMatch } : {}),
    });
  }
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

interface LifecycleQueryInput {
  version?: string;
  sync?: boolean;
  extensions?: string[];
}

function buildLifecycleQuery(
  input: LifecycleQueryInput,
): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {};
  if (input.version !== undefined) query.version = input.version;
  if (input.sync !== undefined) query.sync = String(input.sync);
  if (input.extensions && input.extensions.length > 0) query.extensions = input.extensions;
  return query;
}

interface EnvelopeFields {
  key?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
}

function wrapEnvelope(fields: EnvelopeFields): Record<string, unknown> {
  const out: Record<string, unknown> = { attributes: fields.attributes ?? {} };
  if (fields.key !== undefined) out.key = fields.key;
  if (fields.tags !== undefined) out.tags = fields.tags;
  return out;
}

function pascalize(key: string): string {
  if (key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}
