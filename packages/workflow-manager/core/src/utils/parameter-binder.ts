/**
 * `${param}` and `${a.b.c}` template binding for view contents and URN strings.
 *
 * Resolution priority (see `docs/workflow-manager.md` §9):
 *   1. explicit `context` map (handler input)
 *   2. `ParameterRegistry` (host-provided external state)
 *   3. previous API response (`previousData`)
 *   4. fallback strategy (`throwError` | `emptyString` | `keepPlaceholder`)
 *
 * Path navigation supports dot notation (`user.profile.name`) and numeric
 * array indices (`accounts.0.id`).
 *
 * `bindMap()` walks objects/arrays recursively and binds string leaves.
 */

import { ParameterBindingError } from '../errors.js';
import type { ParameterRegistry } from '../types.js';

export type MissingStrategy = 'throwError' | 'emptyString' | 'keepPlaceholder';

export interface ParameterBinderOptions {
  registry?: ParameterRegistry;
  strategy?: MissingStrategy;
}

const PLACEHOLDER_RE = /\$\{([^}]+)\}/g;

export class ParameterBinder {
  private readonly registry?: ParameterRegistry;
  private readonly strategy: MissingStrategy;

  constructor(opts: ParameterBinderOptions = {}) {
    if (opts.registry) this.registry = opts.registry;
    this.strategy = opts.strategy ?? 'throwError';
  }

  bind(input: {
    template: string;
    context?: Record<string, unknown>;
    previousData?: Record<string, unknown>;
  }): string {
    const { template } = input;
    if (!template || !ParameterBinder.hasParameters(template)) return template;

    const context = input.context ?? {};
    const previousData = input.previousData ?? {};

    return template.replace(PLACEHOLDER_RE, (match, raw: string) => {
      const path = raw.trim();
      const resolved = this.resolve(path, context, previousData);
      if (resolved === undefined) {
        return this.handleMissing(path, template, match);
      }
      return ParameterBinder.toScalarString(resolved);
    });
  }

  bindMap(input: {
    data: Record<string, unknown>;
    context?: Record<string, unknown>;
    previousData?: Record<string, unknown>;
  }): Record<string, unknown> {
    const out = this.deepBind(input.data, input.context ?? {}, input.previousData ?? {});
    return out as Record<string, unknown>;
  }

  static extractParameters(template: string): string[] {
    if (!template) return [];
    const found: string[] = [];
    PLACEHOLDER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PLACEHOLDER_RE.exec(template)) !== null) {
      const raw = m[1];
      if (raw !== undefined) found.push(raw.trim());
    }
    return found;
  }

  static hasParameters(template: string): boolean {
    if (!template) return false;
    PLACEHOLDER_RE.lastIndex = 0;
    return PLACEHOLDER_RE.test(template);
  }

  // --------------------------------------------------------------------------

  private resolve(
    path: string,
    context: Record<string, unknown>,
    previousData: Record<string, unknown>,
  ): unknown {
    const fromContext = lookup(context, path);
    if (fromContext !== undefined) return fromContext;

    if (this.registry) {
      // Try whole-key first, then root segment.
      const direct = this.registry.getValue(path);
      if (direct !== undefined) return direct;

      const dot = path.indexOf('.');
      if (dot > 0) {
        const head = path.slice(0, dot);
        const tail = path.slice(dot + 1);
        const partial = this.registry.getValue(head);
        if (partial !== undefined) {
          const nested = lookup(partial as Record<string, unknown>, tail);
          if (nested !== undefined) return nested;
        }
      }
    }

    return lookup(previousData, path);
  }

  private handleMissing(path: string, template: string, originalMatch: string): string {
    switch (this.strategy) {
      case 'emptyString':
        return '';
      case 'keepPlaceholder':
        return originalMatch;
      case 'throwError':
      default:
        throw new ParameterBindingError({
          message: `Cannot resolve "${path}" in template "${template}"`,
          parameter: path,
          template,
        });
    }
  }

  private deepBind(
    value: unknown,
    context: Record<string, unknown>,
    previousData: Record<string, unknown>,
  ): unknown {
    if (typeof value === 'string') {
      return this.bind({ template: value, context, previousData });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.deepBind(item, context, previousData));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.deepBind(v, context, previousData);
      }
      return out;
    }
    return value;
  }

  private static toScalarString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

/** Dot/index path lookup: `a.b.0.c` → walks objects and arrays. */
function lookup(source: unknown, path: string): unknown {
  if (source === null || source === undefined) return undefined;
  if (path === '') return undefined;

  const segments = path.split('.');
  let cursor: unknown = source;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;

    if (Array.isArray(cursor)) {
      const idx = Number(segment);
      if (Number.isInteger(idx) && idx >= 0 && idx < cursor.length) {
        cursor = cursor[idx];
        continue;
      }
      return undefined;
    }

    if (typeof cursor === 'object') {
      const obj = cursor as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, segment)) {
        cursor = obj[segment];
        continue;
      }
      return undefined;
    }

    return undefined;
  }

  return cursor;
}
