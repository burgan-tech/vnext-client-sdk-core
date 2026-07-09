/**
 * JSON Schema-driven body filter for transition requests.
 *
 * Behavior (see `docs/workflow-manager.md` §8):
 * 1. Read `properties` and `additionalProperties` from the schema.
 * 2. If `additionalProperties === false`, drop body keys that are not declared
 *    in `properties`.
 * 3. Recurse into nested object properties when their sub-schema is `object`
 *    (with its own `properties`).
 * 4. Arrays whose `items` schema is an object are filtered element-by-element.
 *
 * This helper does NO type coercion or validation — it only **prunes** keys
 * that the backend schema does not accept. Validation is left to the backend.
 */

import type { VNextTransitionSchema } from '../types.js';

type JsonSchema = Record<string, unknown> & {
  type?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
};

export class SchemaFilter {
  static filterBodyBySchema(input: {
    body: Record<string, unknown>;
    schema: VNextTransitionSchema;
  }): Record<string, unknown> {
    const root = input.schema?.schema as JsonSchema | undefined;
    if (!root || typeof root !== 'object') return { ...input.body };

    const filtered = SchemaFilter.applyObjectSchema(input.body, root);
    return filtered;
  }

  // --------------------------------------------------------------------------

  private static applyObjectSchema(
    value: Record<string, unknown>,
    schema: JsonSchema,
  ): Record<string, unknown> {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
    const additionalAllowed = SchemaFilter.allowAdditional(schema);

    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(value)) {
      const propSchema = properties[key];

      if (propSchema) {
        out[key] = SchemaFilter.applyAny(raw, propSchema);
        continue;
      }

      if (additionalAllowed === true) {
        out[key] = raw;
      } else if (additionalAllowed === false) {
        // drop
      } else {
        // additionalProperties is itself a schema — pass the raw value through,
        // but if it's an object we recurse using that schema.
        out[key] = SchemaFilter.applyAny(raw, additionalAllowed);
      }
    }

    return out;
  }

  private static applyAny(value: unknown, schema: JsonSchema): unknown {
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
      const itemSchema = schema.items;
      if (itemSchema && typeof itemSchema === 'object') {
        return value.map((item) => SchemaFilter.applyAny(item, itemSchema));
      }
      return value;
    }

    if (typeof value === 'object') {
      if (schema.type === 'object' || schema.properties) {
        return SchemaFilter.applyObjectSchema(value as Record<string, unknown>, schema);
      }
      return value;
    }

    return value;
  }

  /**
   * Returns:
   *  - `true`  when additional properties are allowed unrestricted,
   *  - `false` when they must be dropped,
   *  - a `JsonSchema` when additional properties have their own shape.
   *
   * Defaults to `true` when the schema does not specify the constraint
   * (matches JSON Schema spec).
   */
  private static allowAdditional(schema: JsonSchema): boolean | JsonSchema {
    const ap = schema.additionalProperties;
    if (ap === undefined) return true;
    if (typeof ap === 'boolean') return ap;
    if (typeof ap === 'object' && ap !== null) return ap;
    return true;
  }
}
