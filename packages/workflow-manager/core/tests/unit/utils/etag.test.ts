import { describe, expect, it } from 'vitest';
import { is304, pickETags, withIfNoneMatch } from '../../../src/utils/etag.js';
import type { HttpResponse } from '../../../src/types.js';

function res<T>(partial: Partial<HttpResponse<T>>): HttpResponse<T> {
  return { ok: true, status: 200, headers: {}, data: null, ...partial };
}

describe('etag utils', () => {
  describe('pickETags', () => {
    it('prefers headers (case-insensitive)', () => {
      const out = pickETags(
        res({
          headers: { ETag: 'snap-h', 'x-entity-etag': 'ent-h' },
          data: { eTag: 'snap-b', entityEtag: 'ent-b' },
        }),
      );
      expect(out).toEqual({ eTag: 'snap-h', entityEtag: 'ent-h' });
    });

    it('falls back to body fields when headers missing', () => {
      const out = pickETags(res({ data: { eTag: 'b1', entityEtag: 'b2' } }));
      expect(out).toEqual({ eTag: 'b1', entityEtag: 'b2' });
    });

    it('accepts legacy lowercase body keys', () => {
      const out = pickETags(res({ data: { etag: 'legacy' } as Record<string, unknown> }));
      expect(out).toEqual({ eTag: 'legacy' });
    });

    it('returns empty object when neither header nor body has ETag', () => {
      expect(pickETags(res({ data: { unrelated: 1 } }))).toEqual({});
    });

    it('handles missing data', () => {
      expect(pickETags(res({ headers: { etag: 'h' } }))).toEqual({ eTag: 'h' });
      expect(pickETags(res({ data: null }))).toEqual({});
    });

    it('ignores empty string ETag', () => {
      expect(pickETags(res({ data: { eTag: '' } }))).toEqual({});
    });
  });

  describe('withIfNoneMatch', () => {
    it('returns headers untouched when eTag is missing', () => {
      const headers = { 'X-A': '1' };
      expect(withIfNoneMatch(headers, undefined)).toBe(headers);
    });

    it('adds If-None-Match header when eTag present', () => {
      expect(withIfNoneMatch({ A: '1' }, 'abc')).toEqual({ A: '1', 'If-None-Match': 'abc' });
    });

    it('handles undefined headers parameter', () => {
      expect(withIfNoneMatch(undefined, 'abc')).toEqual({ 'If-None-Match': 'abc' });
    });
  });

  describe('is304', () => {
    it('detects 304 response status', () => {
      expect(is304(res({ status: 304 }))).toBe(true);
      expect(is304(res({ status: 200 }))).toBe(false);
    });
  });
});
