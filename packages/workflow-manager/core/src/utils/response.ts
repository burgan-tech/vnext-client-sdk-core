/**
 * Backend response → SDK DTO parsers.
 *
 * Each helper takes an `HttpResponse<unknown>` and returns the typed SDK DTO,
 * normalising:
 *  - status string → `VNextInstanceStatus` enum literal (single conversion point)
 *  - effective state type/sub-type → enum literals
 *  - ETag two-channel reading (header preferred, body fallback)
 *  - HAL `links` envelope for list endpoints
 *  - `transitionId` → `transitionKey` rename for history rows
 *
 * Parsers never throw on missing optional fields — they fill defaults and let
 * the caller handle business errors via the surrounding `Result` envelope.
 */

import {
  instanceStatusFromWire,
  stateSubTypeFromWire,
  stateTypeFromWire,
} from '../enums.js';
import type {
  HttpResponse,
  ProblemDetails,
  RetryWorkflowResult,
  StartTransitionResult,
  StartWorkflowResult,
  ValidationError,
  VNextAvailableTransition,
  VNextGetInstanceResponse,
  VNextInstanceMetadata,
  VNextInstanceSnapshot,
  VNextPaginationLinks,
  VNextStateCorrelation,
  VNextStateFunctionResponse,
  VNextTransitionHistoryEntry,
  VNextViewResponse,
  WorkflowErrorPayload,
} from '../types.js';
import { pickETags } from './etag.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Obj;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringDefault(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolDefault(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

// ---------------------------------------------------------------------------
// ProblemDetails
// ---------------------------------------------------------------------------

export function parseProblemDetails(body: unknown): ProblemDetails | undefined {
  const obj = asObject(body);
  if (!obj) return undefined;

  // Heuristic: RFC 7807 always carries one of these.
  if (
    asString(obj.type) === undefined &&
    asString(obj.title) === undefined &&
    asNumber(obj.status) === undefined &&
    asString(obj.detail) === undefined
  ) {
    return undefined;
  }

  const out: ProblemDetails = {};
  const t = asString(obj.type);
  const ti = asString(obj.title);
  const st = asNumber(obj.status);
  const d = asString(obj.detail);
  const inst = asString(obj.instance);
  if (t !== undefined) out.type = t;
  if (ti !== undefined) out.title = ti;
  if (st !== undefined) out.status = st;
  if (d !== undefined) out.detail = d;
  if (inst !== undefined) out.instance = inst;
  return out;
}

/** Build the canonical Result.error envelope from a failed HttpResponse. */
export function errorPayloadFromResponse<T>(
  response: HttpResponse<T>,
  fallbackMessage: string,
): WorkflowErrorPayload {
  const problem = parseProblemDetails(response.data);
  const out: WorkflowErrorPayload = {
    code: response.status > 0 ? `http_${response.status}` : 'network',
    message: problem?.detail ?? problem?.title ?? fallbackMessage,
    body: response.data,
  };
  if (problem) out.problem = problem;

  // Custom error envelope: { error: { prefix, code, message, validationErrors, data } }
  const inner = asObject(asObject(response.data)?.error);
  if (inner) {
    const innerMsg = asString(inner.message);
    if (innerMsg) out.message = innerMsg;

    // Primary: validationErrors[].{message, members}
    const ves = asArray(inner.validationErrors);
    if (ves.length > 0) {
      out.validationErrors = ves.flatMap((e) => {
        const o = asObject(e);
        const msg = asString(o?.message);
        if (!msg) return [];
        const ve: ValidationError = { message: msg };
        const mems = asArray(o?.members).filter((m): m is string => typeof m === 'string');
        if (mems.length) ve.members = mems;
        return [ve];
      });
    } else {
      // Fallback: data.validation.errors[].{path, keyword, code, message}
      const detailErrors = asArray(asObject(asObject(inner.data)?.validation)?.errors);
      if (detailErrors.length > 0) {
        out.validationErrors = detailErrors.flatMap((e) => {
          const o = asObject(e);
          const msg = asString(o?.message);
          if (!msg) return [];
          const ve: ValidationError = { message: msg };
          const path = asString(o?.path);
          const keyword = asString(o?.keyword);
          const code = asString(o?.code);
          if (path) ve.path = path;
          if (keyword) ve.keyword = keyword;
          if (code) ve.code = code;
          return [ve];
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// transitions / correlations sub-objects
// ---------------------------------------------------------------------------

function parseAvailableTransitions(raw: unknown): VNextAvailableTransition[] {
  return asArray(raw).map((entry) => {
    const o = asObject(entry) ?? {};
    const view = asObject(o.view) ?? {};
    const schema = asObject(o.schema) ?? {};
    const out: VNextAvailableTransition = {
      key: asStringDefault(o.name ?? o.key),
      view: {
        hasView: asBoolDefault(view.hasView),
        loadData: asBoolDefault(view.loadData),
        ...(asString(view.href) !== undefined ? { href: asStringDefault(view.href) } : {}),
      },
      schema: {
        hasSchema: asBoolDefault(schema.hasSchema),
        ...(asString(schema.href) !== undefined ? { href: asStringDefault(schema.href) } : {}),
      },
      ...(asString(o.href) !== undefined ? { href: asStringDefault(o.href) } : {}),
    };
    return out;
  });
}

function parseStateCorrelations(raw: unknown): VNextStateCorrelation[] {
  return asArray(raw).map((entry) => {
    const o = asObject(entry) ?? {};
    const out: VNextStateCorrelation = {
      correlationId: asStringDefault(o.correlationId),
      parentState: asStringDefault(o.parentState),
      subFlowInstanceId: asStringDefault(o.subFlowInstanceId),
      subFlowType: asStringDefault(o.subFlowType),
      subFlowDomain: asStringDefault(o.subFlowDomain),
      subFlowName: asStringDefault(o.subFlowName),
      isCompleted: asBoolDefault(o.isCompleted),
      ...(asString(o.subFlowVersion) !== undefined
        ? { subFlowVersion: asStringDefault(o.subFlowVersion) }
        : {}),
      ...(asString(o.href) !== undefined ? { href: asStringDefault(o.href) } : {}),
      ...(asString(o.status) !== undefined ? { status: asStringDefault(o.status) } : {}),
      ...(asString(o.currentState) !== undefined
        ? { currentState: asStringDefault(o.currentState) }
        : {}),
    };
    return out;
  });
}

// ---------------------------------------------------------------------------
// state function (long polling primary)
// ---------------------------------------------------------------------------

export function parseStateFunctionResponse(
  response: HttpResponse<unknown>,
  onUnknown?: (raw: string) => void,
): VNextStateFunctionResponse {
  const obj = asObject(response.data) ?? ({} as Obj);
  const data = asObject(obj.data) ?? { href: '' };
  const view = asObject(obj.view) ?? { hasView: false, href: '', loadData: false };

  const eTags = pickETags(response);

  // Convert the wire status here only when callers need it; consumers of the
  // raw DTO usually keep the string form. We expose the helper for callers.
  if (onUnknown) instanceStatusFromWire(asString(obj.status), onUnknown);

  const stateType = stateTypeFromWire(asString(obj.stateType), onUnknown);

  return {
    state: asStringDefault(obj.state),
    ...(stateType ? { stateType } : {}),
    status: asStringDefault(obj.status),
    data: { href: asStringDefault(data.href) },
    view: {
      hasView: asBoolDefault(view.hasView),
      href: asStringDefault(view.href),
      loadData: asBoolDefault(view.loadData),
    },
    transitions: parseAvailableTransitions(obj.transitions),
    activeCorrelations: parseStateCorrelations(obj.activeCorrelations),
    eTag: eTags.eTag ?? asStringDefault(obj.eTag),
    ...(eTags.entityEtag !== undefined
      ? { entityEtag: eTags.entityEtag }
      : asString(obj.entityEtag) !== undefined
        ? { entityEtag: asStringDefault(obj.entityEtag) }
        : {}),
  };
}

// ---------------------------------------------------------------------------
// get instance (envelope)
// ---------------------------------------------------------------------------

export function parseInstanceMetadata(
  raw: unknown,
  onUnknown?: (kind: 'status' | 'stateType' | 'subType', raw: string) => void,
): VNextInstanceMetadata {
  const o = asObject(raw) ?? ({} as Obj);
  // We pass the wire string straight through; the SDK consumers convert via
  // `instanceStatusFromWire` when projecting into VNextState.
  const out: VNextInstanceMetadata = {
    status: asStringDefault(o.status),
    createdAt: asStringDefault(o.createdAt),
  };
  const cs = asString(o.currentState);
  const es = asString(o.effectiveState);
  if (cs !== undefined) out.currentState = cs;
  if (es !== undefined) out.effectiveState = es;
  const stateType = stateTypeFromWire(asString(o.effectiveStateType), (raw) =>
    onUnknown?.('stateType', raw),
  );
  if (stateType) out.effectiveStateType = stateType;
  const subType = stateSubTypeFromWire(asString(o.effectiveStateSubType), (raw) =>
    onUnknown?.('subType', raw),
  );
  if (subType) out.effectiveStateSubType = subType;
  if (asString(o.completedAt) !== undefined) out.completedAt = asStringDefault(o.completedAt);
  if (asNumber(o.duration) !== undefined) out.duration = asNumber(o.duration) ?? 0;
  if (asString(o.modifiedAt) !== undefined) out.modifiedAt = asStringDefault(o.modifiedAt);
  if (asString(o.createdBy) !== undefined) out.createdBy = asStringDefault(o.createdBy);
  if (asString(o.createdByBehalfOf) !== undefined)
    out.createdByBehalfOf = asStringDefault(o.createdByBehalfOf);
  if (asString(o.modifiedBy) !== undefined) out.modifiedBy = asStringDefault(o.modifiedBy);
  if (asString(o.modifiedByBehalfOf) !== undefined)
    out.modifiedByBehalfOf = asStringDefault(o.modifiedByBehalfOf);
  return out;
}

export function parseGetInstanceResponse(
  response: HttpResponse<unknown>,
): VNextGetInstanceResponse {
  const obj = asObject(response.data) ?? ({} as Obj);
  const eTags = pickETags(response);

  const out: VNextGetInstanceResponse = {
    id: asStringDefault(obj.id),
    metadata: parseInstanceMetadata(obj.metadata),
  };
  const key = asString(obj.key);
  const flow = asString(obj.flow);
  const domain = asString(obj.domain);
  const flowVersion = asString(obj.flowVersion);
  if (key !== undefined) out.key = key;
  if (flow !== undefined) out.flow = flow;
  if (domain !== undefined) out.domain = domain;
  if (flowVersion !== undefined) out.flowVersion = flowVersion;
  if (eTags.eTag !== undefined) out.eTag = eTags.eTag;
  else if (asString(obj.eTag) !== undefined) out.eTag = asStringDefault(obj.eTag);
  if (eTags.entityEtag !== undefined) out.entityEtag = eTags.entityEtag;
  else if (asString(obj.entityEtag) !== undefined) out.entityEtag = asStringDefault(obj.entityEtag);
  if (Array.isArray(obj.tags)) out.tags = obj.tags as string[];
  if (obj.attributes !== undefined) out.attributes = obj.attributes;
  const ext = asObject(obj.extensions);
  if (ext) out.extensions = ext;
  return out;
}

// ---------------------------------------------------------------------------
// start / transition / retry outputs
// ---------------------------------------------------------------------------

export function parseStartInstanceOutput(response: HttpResponse<unknown>): StartWorkflowResult {
  const obj = asObject(response.data) ?? ({} as Obj);
  const eTags = pickETags(response);
  const status = instanceStatusFromWire(asString(obj.status));

  const out: StartWorkflowResult = {
    ok: response.ok,
    statusCode: response.status,
    status,
  };
  const id = asString(obj.id);
  if (id !== undefined) out.instanceId = id;
  if (eTags.eTag !== undefined) out.eTag = eTags.eTag;
  else if (asString(obj.eTag) !== undefined) out.eTag = asStringDefault(obj.eTag);
  if (!response.ok) out.error = errorPayloadFromResponse(response, 'startWorkflow failed');
  return out;
}

export function parseTransitionOutput(response: HttpResponse<unknown>): StartTransitionResult {
  const obj = asObject(response.data) ?? ({} as Obj);
  const eTags = pickETags(response);
  const status = instanceStatusFromWire(asString(obj.status));

  const out: StartTransitionResult = {
    ok: response.ok,
    statusCode: response.status,
    status,
  };
  const id = asString(obj.id);
  if (id !== undefined) out.instanceId = id;
  if (eTags.eTag !== undefined) out.eTag = eTags.eTag;
  else if (asString(obj.eTag) !== undefined) out.eTag = asStringDefault(obj.eTag);
  if (!response.ok) out.error = errorPayloadFromResponse(response, 'startTransition failed');
  return out;
}

export function parseRetryInstanceOutput(response: HttpResponse<unknown>): RetryWorkflowResult {
  const obj = asObject(response.data) ?? ({} as Obj);
  const status = instanceStatusFromWire(asString(obj.status));

  const out: RetryWorkflowResult = {
    ok: response.ok,
    statusCode: response.status,
    status,
  };
  const id = asString(obj.id);
  if (id !== undefined) out.instanceId = id;
  const retried = asString(obj.retriedTransitionId);
  if (retried !== undefined) out.retriedTransitionId = retried;
  if (!response.ok) out.error = errorPayloadFromResponse(response, 'retryWorkflow failed');
  return out;
}

// ---------------------------------------------------------------------------
// view function response
// ---------------------------------------------------------------------------

export function parseViewResponse(response: HttpResponse<unknown>): VNextViewResponse {
  const obj = asObject(response.data) ?? ({} as Obj);
  return {
    key: asStringDefault(obj.key),
    content: obj.content,
    type: asStringDefault(obj.type),
    display: asStringDefault(obj.display),
    label: asStringDefault(obj.label),
  };
}

// ---------------------------------------------------------------------------
// query response
// ---------------------------------------------------------------------------

export interface ParsedQueryResponse {
  items: VNextInstanceSnapshot[];
  links: VNextPaginationLinks;
  raw: Record<string, unknown>;
}

export function parseQueryResponse(response: HttpResponse<unknown>): ParsedQueryResponse {
  const obj = asObject(response.data) ?? ({} as Obj);
  const items = asArray(obj.items).map((entry) => parseInstanceSnapshot(entry));
  const linksRaw = asObject(obj.links) ?? {};
  const links: VNextPaginationLinks = {
    self: asStringDefault(linksRaw.self),
    first: asStringDefault(linksRaw.first),
    next: asStringDefault(linksRaw.next),
    prev: asStringDefault(linksRaw.prev),
  };
  return { items, links, raw: obj };
}

function parseInstanceSnapshot(raw: unknown): VNextInstanceSnapshot {
  const o = asObject(raw) ?? ({} as Obj);

  // Backend uses `flow` or `workflow` as wire field for the workflow name.
  const wireName = asString(o.name) ?? asString(o.flow) ?? asString(o.workflow) ?? '';
  const meta = asObject(o.metadata) ?? ({} as Obj);

  // Status, currentState, createdAt, modifiedAt are surfaced under
  // `metadata.*` by the runtime's listing endpoints. Older response shapes
  // (single-instance lookups, mocks) put them at the root, so we fall back to
  // the root for compatibility.
  const status = instanceStatusFromWire(asString(o.status) ?? asString(meta.status));

  const out: VNextInstanceSnapshot = {
    id: asStringDefault(o.id),
    name: wireName,
    domain: asStringDefault(o.domain),
    status,
    attributes: o.attributes,
    createdAt: asStringDefault(asString(o.createdAt) ?? asString(meta.createdAt)),
  };
  const key = asString(o.key);
  if (key !== undefined) out.key = key;
  const cs = asString(o.currentState) ?? asString(meta.currentState);
  if (cs !== undefined) out.currentState = cs;
  const fv = asString(o.flowVersion);
  if (fv !== undefined) out.flowVersion = fv;
  if (Array.isArray(o.tags)) out.tags = o.tags as string[];
  const modifiedAt = asString(o.modifiedAt) ?? asString(meta.modifiedAt);
  if (modifiedAt !== undefined) out.modifiedAt = modifiedAt;
  return out;
}

// ---------------------------------------------------------------------------
// transition history
// ---------------------------------------------------------------------------

export function parseTransitionHistoryResponse(
  response: HttpResponse<unknown>,
): VNextTransitionHistoryEntry[] {
  const obj = asObject(response.data) ?? ({} as Obj);
  return asArray(obj.transitions).map((entry) => parseTransitionHistoryEntry(entry));
}

function parseTransitionHistoryEntry(raw: unknown): VNextTransitionHistoryEntry {
  const o = asObject(raw) ?? ({} as Obj);
  return {
    id: asStringDefault(o.id),
    // wire field is misleadingly named `transitionId` but carries the key.
    transitionKey: asStringDefault(o.transitionId ?? o.transitionKey),
    fromState: asStringDefault(o.fromState),
    toState: asStringDefault(o.toState),
    startedAt: asStringDefault(o.startedAt),
    finishedAt: asStringDefault(o.finishedAt),
    durationSeconds: asNumber(o.durationSeconds) ?? 0,
    triggerType: (asString(o.triggerType) === 'automatic' ? 'automatic' : 'manual') as
      | 'manual'
      | 'automatic',
    body: asObject(o.body) ?? {},
    header: (asObject(o.header) ?? {}) as Record<string, string>,
    createdAt: asStringDefault(o.createdAt),
  };
}
