/**
 * Default `EndpointResolver` — produces host-relative `/{domain}/...` paths for
 * every public `WorkflowOperation`. Path templates mirror
 * `docs/workflow-manager-interface.md` §10 and `docs/backend-api.md` §2 minus
 * the API prefix.
 *
 * The API prefix (`/api/v1`, a gateway base, a tenant slug, …) is NOT baked in
 * here — it is supplied by the host's base URL (the `HttpDelegate`'s `baseUrl`
 * or the dev proxy target). This keeps the same resolver usable against
 * runtimes that serve the workflow API under different prefixes (internal
 * `/api/v1`, DMZ gateway without it). Consumers needing fully custom paths can
 * still supply their own resolver via `WorkflowManagerOptions.endpointResolver`.
 *
 * Path-segment values are URI-encoded so that business keys containing
 * reserved characters (`/`, `?`, `#`, …) round-trip correctly.
 */

import type {
  EndpointResolution,
  EndpointResolver,
  HttpMethod,
  WorkflowOperation,
} from '../types.js';

interface Template {
  method: HttpMethod;
  pattern: string;
  required: readonly string[];
}

const TEMPLATES: Readonly<Record<WorkflowOperation, Template>> = {
  startInstance: {
    method: 'POST',
    pattern: '/{domain}/workflows/{name}/instances/start',
    required: ['domain', 'name'],
  },
  transition: {
    method: 'PATCH',
    pattern:
      '/{domain}/workflows/{name}/instances/{instanceIdOrKey}/transitions/{transitionKey}',
    required: ['domain', 'name', 'instanceIdOrKey', 'transitionKey'],
  },
  retry: {
    method: 'POST',
    pattern: '/{domain}/workflows/{name}/instances/{instanceIdOrKey}/retry',
    required: ['domain', 'name', 'instanceIdOrKey'],
  },
  getInstance: {
    method: 'GET',
    pattern: '/{domain}/workflows/{name}/instances/{instanceIdOrKey}',
    required: ['domain', 'name', 'instanceIdOrKey'],
  },
  getInstanceState: {
    method: 'GET',
    pattern: '/{domain}/workflows/{name}/instances/{instanceIdOrKey}/functions/state',
    required: ['domain', 'name', 'instanceIdOrKey'],
  },
  queryInstances: {
    method: 'GET',
    pattern: '/{domain}/workflows/{name}/instances',
    required: ['domain', 'name'],
  },
  getTransitionHistory: {
    method: 'GET',
    pattern: '/{domain}/workflows/{name}/instances/{instanceIdOrKey}/transitions',
    required: ['domain', 'name', 'instanceIdOrKey'],
  },
  domainFunction: {
    method: 'GET',
    pattern: '/{domain}/functions/{functionName}',
    required: ['domain', 'functionName'],
  },
  instanceFunction: {
    method: 'GET',
    pattern:
      '/{domain}/workflows/{name}/instances/{instanceIdOrKey}/functions/{functionName}',
    required: ['domain', 'name', 'instanceIdOrKey', 'functionName'],
  },
};

export class DefaultEndpointResolver implements EndpointResolver {
  resolve(operation: WorkflowOperation, params: Record<string, string>): EndpointResolution {
    const template = TEMPLATES[operation];
    if (!template) {
      throw new Error(`Unknown WorkflowOperation: ${operation}`);
    }

    for (const key of template.required) {
      const value = params[key];
      if (value === undefined || value === null || value === '') {
        throw new Error(`Missing path parameter "${key}" for operation "${operation}"`);
      }
    }

    const path = template.pattern.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = params[name];
      return encodeURIComponent(value ?? '');
    });

    return { method: template.method, path };
  }
}
