/**
 * URN parser for `urn:vnext:flow:<command>:<domain>:<flowName>[:<instanceId>][:<transitionKey>]`.
 *
 * Grammar and validation rules: see `docs/amorphie-urn-schema.md`.
 *
 * Throws `MalformedURNError` on any rule violation; callers (e.g. the URN view
 * handler) are expected to catch and surface via `viewActionFailed`.
 */

import { MalformedURNError } from '../errors.js';

export interface ParsedURN {
  namespace: string;
  type: string;
  command: 'start' | 'transition' | 'continue';
  domain: string;
  flowName: string;
  instanceId?: string;
  transitionKey?: string;
  readonly isStart: boolean;
  readonly isTransition: boolean;
  readonly isContinue: boolean;
}

const KNOWN_COMMANDS = new Set(['start', 'transition', 'continue']);

const EXPECTED_FORMAT_GENERIC =
  'urn:vnext:flow:start:DOMAIN:FLOW_NAME or urn:vnext:flow:transition:...';

export class URNParser {
  parse(urn: string): ParsedURN {
    if (!urn || urn.length === 0) {
      throw new MalformedURNError({
        message: 'URN cannot be empty',
        urn: urn ?? '',
        expectedFormat: EXPECTED_FORMAT_GENERIC,
      });
    }

    const parts = urn.split(':');

    if (parts.length < 6) {
      throw new MalformedURNError({
        message: `URN must have at least 6 parts, got ${parts.length}`,
        urn,
        expectedFormat: 'urn:vnext:flow:start:DOMAIN:FLOW_NAME (minimum 6 parts)',
      });
    }

    if (parts[0]?.toLowerCase() !== 'urn') {
      throw new MalformedURNError({
        message: 'URN must start with "urn:"',
        urn,
        expectedFormat: 'URN must start with "urn:"',
      });
    }

    const namespace = parts[1] ?? '';
    if (namespace.toLowerCase() !== 'vnext') {
      throw new MalformedURNError({
        message: `Namespace must be "vnext", got "${namespace}"`,
        urn,
        expectedFormat: `Namespace must be "vnext", got "${namespace}"`,
      });
    }

    const type = parts[2] ?? '';
    if (type.toLowerCase() !== 'flow') {
      throw new MalformedURNError({
        message: `Type must be "flow", got "${type}"`,
        urn,
        expectedFormat: `Type must be "flow", got "${type}"`,
      });
    }

    const rawCommand = (parts[3] ?? '').toLowerCase();
    if (!KNOWN_COMMANDS.has(rawCommand)) {
      throw new MalformedURNError({
        message: `Command must be "start", "transition", or "continue", got "${parts[3] ?? ''}"`,
        urn,
        expectedFormat: `Command must be "start", "transition", or "continue", got "${parts[3] ?? ''}"`,
      });
    }
    const command = rawCommand as 'start' | 'transition' | 'continue';

    // Domain & flow name are required for every command.
    const domain = parts[4] ?? '';
    if (domain.length === 0) {
      throw new MalformedURNError({
        message: 'Domain cannot be empty',
        urn,
        expectedFormat: 'Domain cannot be empty',
      });
    }

    const flowName = parts[5] ?? '';
    if (flowName.length === 0) {
      throw new MalformedURNError({
        message: 'Flow name cannot be empty',
        urn,
        expectedFormat: 'Flow name cannot be empty',
      });
    }

    if (command === 'start') {
      if (parts.length !== 6) {
        throw new MalformedURNError({
          message: `Start URN must have exactly 6 parts, got ${parts.length}`,
          urn,
          expectedFormat:
            'Start URN must have exactly 6 parts: urn:vnext:flow:start:DOMAIN:FLOW_NAME',
        });
      }

      return this.toParsed({ command, namespace: 'vnext', type: 'flow', domain, flowName });
    }

    if (command === 'continue') {
      if (parts.length !== 7) {
        throw new MalformedURNError({
          message: `Continue URN must have exactly 7 parts, got ${parts.length}`,
          urn,
          expectedFormat:
            'Continue URN must have exactly 7 parts: urn:vnext:flow:continue:DOMAIN:FLOW_NAME:INSTANCE_ID',
        });
      }
      const instanceId = parts[6] ?? '';
      if (instanceId.length === 0) {
        throw new MalformedURNError({
          message: 'Instance ID cannot be empty',
          urn,
          expectedFormat: 'Instance ID cannot be empty',
        });
      }
      return this.toParsed({
        command,
        namespace: 'vnext',
        type: 'flow',
        domain,
        flowName,
        instanceId,
      });
    }

    // command === 'transition'
    if (parts.length !== 8) {
      throw new MalformedURNError({
        message: `Transition URN must have exactly 8 parts, got ${parts.length}`,
        urn,
        expectedFormat:
          'Transition URN must have exactly 8 parts: urn:vnext:flow:transition:DOMAIN:FLOW_NAME:INSTANCE_ID:TRANSITION_KEY',
      });
    }
    const instanceId = parts[6] ?? '';
    if (instanceId.length === 0) {
      throw new MalformedURNError({
        message: 'Instance ID cannot be empty',
        urn,
        expectedFormat: 'Instance ID cannot be empty',
      });
    }
    const transitionKey = parts[7] ?? '';
    if (transitionKey.length === 0) {
      throw new MalformedURNError({
        message: 'Transition key cannot be empty',
        urn,
        expectedFormat: 'Transition key cannot be empty',
      });
    }
    return this.toParsed({
      command,
      namespace: 'vnext',
      type: 'flow',
      domain,
      flowName,
      instanceId,
      transitionKey,
    });
  }

  isValid(urn: string): boolean {
    try {
      this.parse(urn);
      return true;
    } catch {
      return false;
    }
  }

  private toParsed(parts: {
    command: 'start' | 'transition' | 'continue';
    namespace: string;
    type: string;
    domain: string;
    flowName: string;
    instanceId?: string;
    transitionKey?: string;
  }): ParsedURN {
    const command = parts.command;
    const out: ParsedURN = {
      namespace: parts.namespace,
      type: parts.type,
      command,
      domain: parts.domain,
      flowName: parts.flowName,
      ...(parts.instanceId !== undefined ? { instanceId: parts.instanceId } : {}),
      ...(parts.transitionKey !== undefined ? { transitionKey: parts.transitionKey } : {}),
      get isStart() {
        return command === 'start';
      },
      get isTransition() {
        return command === 'transition';
      },
      get isContinue() {
        return command === 'continue';
      },
    };
    return out;
  }
}
