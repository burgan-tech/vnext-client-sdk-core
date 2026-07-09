/**
 * View handler for `urn` views — parses the URN, optionally binds `${param}`
 * placeholders, then dispatches the corresponding lifecycle call.
 *
 * The constructor takes the lifecycle methods as plain functions (rather than
 * the full `WorkflowManager`) to keep the handler decoupled and make the
 * bidirectional dependency between the facade and its handlers explicit.
 */

import { MalformedURNError, ViewHandlerError } from '../errors.js';
import type {
  ParameterRegistry,
  StartTransitionInput,
  StartTransitionResult,
  StartWorkflowInput,
  StartWorkflowResult,
  ContinueWorkflowInput,
  ContinueWorkflowResult,
  VNextView,
  VNextViewType,
  ViewHandler,
  ViewHandlerResult,
} from '../types.js';
import { ParameterBinder } from '../utils/parameter-binder.js';
import { URNParser } from '../utils/urn-parser.js';

export interface URNViewHandlerOptions {
  startWorkflow: (input: StartWorkflowInput) => Promise<StartWorkflowResult>;
  startTransition: (input: StartTransitionInput) => Promise<StartTransitionResult>;
  continueWorkflow: (input: ContinueWorkflowInput) => Promise<ContinueWorkflowResult>;
  defaultVersion?: string;
  parameterRegistry?: ParameterRegistry;
  parameterBinder?: ParameterBinder;
  urnParser?: URNParser;
}

export class URNViewHandler implements ViewHandler {
  readonly viewType: VNextViewType = 'urn';

  private readonly startWorkflow: (input: StartWorkflowInput) => Promise<StartWorkflowResult>;
  private readonly startTransition: (
    input: StartTransitionInput,
  ) => Promise<StartTransitionResult>;
  private readonly continueWorkflow: (
    input: ContinueWorkflowInput,
  ) => Promise<ContinueWorkflowResult>;

  private readonly defaultVersion?: string;
  private readonly parser: URNParser;
  private readonly binder: ParameterBinder;

  constructor(opts: URNViewHandlerOptions) {
    this.startWorkflow = opts.startWorkflow;
    this.startTransition = opts.startTransition;
    this.continueWorkflow = opts.continueWorkflow;
    if (opts.defaultVersion !== undefined) this.defaultVersion = opts.defaultVersion;
    this.parser = opts.urnParser ?? new URNParser();
    this.binder =
      opts.parameterBinder ??
      new ParameterBinder({
        ...(opts.parameterRegistry ? { registry: opts.parameterRegistry } : {}),
        strategy: 'throwError',
      });
  }

  async handle(view: VNextView, context: Record<string, unknown>): Promise<ViewHandlerResult> {
    const rawUrn = pickUrn(view);
    if (!rawUrn) {
      return {
        success: false,
        error: new ViewHandlerError({
          message: 'URN view content has no urn',
          viewType: 'urn',
          operation: 'handle',
        }),
      };
    }

    const previousData = (context.previousData as Record<string, unknown> | undefined) ?? {};

    let bound: string;
    try {
      bound = this.binder.bind({ template: rawUrn, context, previousData });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
        message: 'parameter binding failed',
      };
    }

    let parsed;
    try {
      parsed = this.parser.parse(bound);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e : new MalformedURNError({
          message: String(e),
          urn: bound,
          expectedFormat: 'see docs/amorphie-urn-schema.md',
        }),
      };
    }

    try {
      if (parsed.isStart) {
        const input: StartWorkflowInput = {
          domain: parsed.domain,
          name: parsed.flowName,
          ...(this.defaultVersion ? { version: this.defaultVersion } : {}),
        };
        await this.startWorkflow(input);
        return { success: true };
      }

      if (parsed.isTransition) {
        const input: StartTransitionInput = {
          domain: parsed.domain,
          name: parsed.flowName,
          transitionKey: parsed.transitionKey ?? '',
          instanceId: parsed.instanceId ?? '',
          body: { ...context },
        };
        await this.startTransition(input);
        return { success: true };
      }

      // continue
      const input: ContinueWorkflowInput = {
        domain: parsed.domain,
        name: parsed.flowName,
        instanceId: parsed.instanceId ?? '',
        ...(this.defaultVersion ? { version: this.defaultVersion } : {}),
      };
      await this.continueWorkflow(input);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }
}

function pickUrn(view: VNextView): string | undefined {
  const content = view.content as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const urn = content.urn;
  if (typeof urn === 'string' && urn.length > 0) return urn;
  return undefined;
}
