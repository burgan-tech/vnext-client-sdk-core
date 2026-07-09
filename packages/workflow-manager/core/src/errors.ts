/**
 * Error hierarchy. The SDK's public API never throws — these classes are used
 * internally for structured logging via `OnLog` and surface to consumers
 * through `WorkflowErrorPayload.cause` on Result types.
 *
 * Pure utility helpers (URN parser, parameter binder, schema filter) DO throw;
 * their callers are expected to catch.
 */

import type { ProblemDetails } from './types.js';

export class WorkflowManagerError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    if (cause !== undefined) this.cause = cause;
    // Preserve prototype chain across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof (Error as unknown as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (e: Error, c: unknown) => void }).captureStackTrace(
        this,
        new.target,
      );
    }
  }
}

export class HttpError extends WorkflowManagerError {
  readonly statusCode: number;
  readonly body: unknown;
  readonly headers: Record<string, string>;
  readonly problem?: ProblemDetails;

  constructor(opts: {
    message: string;
    statusCode: number;
    body?: unknown;
    headers?: Record<string, string>;
    problem?: ProblemDetails;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause);
    this.statusCode = opts.statusCode;
    this.body = opts.body;
    this.headers = opts.headers ?? {};
    if (opts.problem) this.problem = opts.problem;
  }
}

export class MalformedURNError extends WorkflowManagerError {
  readonly urn: string;
  readonly expectedFormat: string;

  constructor(opts: { message: string; urn: string; expectedFormat: string; cause?: unknown }) {
    super(opts.message, opts.cause);
    this.urn = opts.urn;
    this.expectedFormat = opts.expectedFormat;
  }
}

export class ParameterBindingError extends WorkflowManagerError {
  readonly parameter: string;
  readonly template: string;

  constructor(opts: { message: string; parameter: string; template: string; cause?: unknown }) {
    super(opts.message, opts.cause);
    this.parameter = opts.parameter;
    this.template = opts.template;
  }
}

export class ViewHandlerError extends WorkflowManagerError {
  readonly viewType: string;
  readonly operation: string;

  constructor(opts: { message: string; viewType: string; operation: string; cause?: unknown }) {
    super(opts.message, opts.cause);
    this.viewType = opts.viewType;
    this.operation = opts.operation;
  }
}

export class ViewContentParseError extends WorkflowManagerError {
  readonly viewType: string;
  readonly content: unknown;

  constructor(opts: { message: string; viewType: string; content: unknown; cause?: unknown }) {
    super(opts.message, opts.cause);
    this.viewType = opts.viewType;
    this.content = opts.content;
  }
}

export class PollingTimeoutError extends WorkflowManagerError {
  readonly workflowName: string;
  readonly instanceId: string;
  readonly elapsedMs: number;

  constructor(opts: {
    message: string;
    workflowName: string;
    instanceId: string;
    elapsedMs: number;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause);
    this.workflowName = opts.workflowName;
    this.instanceId = opts.instanceId;
    this.elapsedMs = opts.elapsedMs;
  }
}
