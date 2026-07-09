import { describe, expect, it } from 'vitest';
import { SchemaFilter } from '../../../src/utils/schema-filter.js';
import type { VNextTransitionSchema } from '../../../src/types.js';

function schema(s: Record<string, unknown>): VNextTransitionSchema {
  return { key: 'k', type: 'workflow', schema: s };
}

describe('SchemaFilter', () => {
  it('drops keys not declared when additionalProperties is false', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { allowed: 1, extra: 2 },
      schema: schema({
        type: 'object',
        properties: { allowed: { type: 'number' } },
        additionalProperties: false,
      }),
    });
    expect(out).toEqual({ allowed: 1 });
  });

  it('keeps unknown keys when additionalProperties is true (default)', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { allowed: 1, extra: 2 },
      schema: schema({
        type: 'object',
        properties: { allowed: { type: 'number' } },
      }),
    });
    expect(out).toEqual({ allowed: 1, extra: 2 });
  });

  it('keeps unknown keys when additionalProperties is true explicitly', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { x: 1, y: 2 },
      schema: schema({
        type: 'object',
        properties: {},
        additionalProperties: true,
      }),
    });
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it('recurses into nested object properties', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { user: { name: 'Ada', age: 30, secret: 'x' }, extra: 1 },
      schema: schema({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: { name: { type: 'string' }, age: { type: 'number' } },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      }),
    });
    expect(out).toEqual({ user: { name: 'Ada', age: 30 } });
  });

  it('filters array element objects via items schema', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { list: [{ k: 1, x: 9 }, { k: 2, x: 9 }] },
      schema: schema({
        type: 'object',
        properties: {
          list: {
            type: 'array',
            items: {
              type: 'object',
              properties: { k: { type: 'number' } },
              additionalProperties: false,
            },
          },
        },
      }),
    });
    expect(out).toEqual({ list: [{ k: 1 }, { k: 2 }] });
  });

  it('passes arrays through when items schema is missing', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { list: [1, 2, 3] },
      schema: schema({
        type: 'object',
        properties: { list: { type: 'array' } },
      }),
    });
    expect(out).toEqual({ list: [1, 2, 3] });
  });

  it('preserves nulls and primitive leaves', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { a: null, b: 'x' },
      schema: schema({
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        additionalProperties: false,
      }),
    });
    expect(out).toEqual({ a: null, b: 'x' });
  });

  it('returns a clone of body when schema.schema is missing', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { x: 1 },
      schema: { key: 'k', type: 'workflow' } as VNextTransitionSchema,
    });
    expect(out).toEqual({ x: 1 });
    expect(out).not.toBe((expect as unknown as object).constructor);
  });

  it('treats additionalProperties as a sub-schema when object', () => {
    const out = SchemaFilter.filterBodyBySchema({
      body: { extra: { nested: 1, drop: 2 } },
      schema: schema({
        type: 'object',
        properties: {},
        additionalProperties: {
          type: 'object',
          properties: { nested: { type: 'number' } },
          additionalProperties: false,
        },
      }),
    });
    expect(out).toEqual({ extra: { nested: 1 } });
  });
});
