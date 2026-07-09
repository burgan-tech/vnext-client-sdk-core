import { describe, expect, it } from 'vitest';
import { ParameterBinder } from '../../../src/utils/parameter-binder.js';
import { ParameterBindingError } from '../../../src/errors.js';
import type { ParameterRegistry } from '../../../src/types.js';

describe('ParameterBinder', () => {
  describe('bind() — basic substitution', () => {
    it('replaces a single placeholder from context', () => {
      const b = new ParameterBinder();
      expect(b.bind({ template: 'hello ${name}', context: { name: 'World' } })).toBe('hello World');
    });

    it('returns the template unchanged when no placeholders', () => {
      const b = new ParameterBinder();
      expect(b.bind({ template: 'no params', context: { x: 1 } })).toBe('no params');
    });

    it('handles empty template', () => {
      const b = new ParameterBinder();
      expect(b.bind({ template: '' })).toBe('');
    });

    it('serializes scalars via String()', () => {
      const b = new ParameterBinder();
      expect(b.bind({ template: '${n}', context: { n: 42 } })).toBe('42');
      expect(b.bind({ template: '${b}', context: { b: true } })).toBe('true');
    });

    it('JSON-stringifies object/array values', () => {
      const b = new ParameterBinder();
      expect(b.bind({ template: '${o}', context: { o: { a: 1 } } })).toBe('{"a":1}');
      expect(b.bind({ template: '${a}', context: { a: [1, 2] } })).toBe('[1,2]');
    });

    it('replaces null/undefined as empty string after resolution', () => {
      const b = new ParameterBinder({ strategy: 'emptyString' });
      expect(b.bind({ template: '${n}', context: {} })).toBe('');
    });
  });

  describe('bind() — dot/index navigation', () => {
    const b = new ParameterBinder();

    it('walks nested objects', () => {
      expect(b.bind({ template: '${user.profile.name}', context: { user: { profile: { name: 'Ada' } } } })).toBe(
        'Ada',
      );
    });

    it('walks array indices', () => {
      expect(b.bind({ template: '${list.1.id}', context: { list: [{ id: 'a' }, { id: 'b' }] } })).toBe(
        'b',
      );
    });

    it('returns missing for out-of-range indices', () => {
      const t = new ParameterBinder({ strategy: 'keepPlaceholder' });
      expect(t.bind({ template: '${list.9}', context: { list: [1] } })).toBe('${list.9}');
    });

    it('returns missing for non-numeric index on arrays', () => {
      const t = new ParameterBinder({ strategy: 'keepPlaceholder' });
      expect(t.bind({ template: '${list.foo}', context: { list: [1] } })).toBe('${list.foo}');
    });

    it('returns missing when intermediate node is null', () => {
      const t = new ParameterBinder({ strategy: 'keepPlaceholder' });
      expect(t.bind({ template: '${a.b}', context: { a: null } })).toBe('${a.b}');
    });
  });

  describe('bind() — resolution priority', () => {
    const registry: ParameterRegistry = {
      getValue(key) {
        if (key === 'fromRegistry') return 'R';
        if (key === 'shadow') return 'fromRegistry';
        return undefined;
      },
    };
    const binder = new ParameterBinder({ registry });

    it('context overrides registry and previousData', () => {
      expect(
        binder.bind({
          template: '${x}',
          context: { x: 'C' },
          previousData: { x: 'P' },
        }),
      ).toBe('C');
    });

    it('falls through to registry when context misses', () => {
      expect(binder.bind({ template: '${fromRegistry}' })).toBe('R');
    });

    it('falls through to previousData when context+registry miss', () => {
      expect(binder.bind({ template: '${y}', previousData: { y: 'P' } })).toBe('P');
    });

    it('registry receives root segment for nested paths', () => {
      const r: ParameterRegistry = {
        getValue(k) {
          if (k === 'session') return { user: 'Bob' };
          return undefined;
        },
      };
      const binder2 = new ParameterBinder({ registry: r });
      expect(binder2.bind({ template: '${session.user}' })).toBe('Bob');
    });
  });

  describe('bind() — missing strategy', () => {
    it('throws by default', () => {
      const b = new ParameterBinder();
      expect(() => b.bind({ template: '${missing}' })).toThrow(ParameterBindingError);
    });

    it('returns empty string with emptyString strategy', () => {
      const b = new ParameterBinder({ strategy: 'emptyString' });
      expect(b.bind({ template: '[${x}]' })).toBe('[]');
    });

    it('keeps placeholder with keepPlaceholder strategy', () => {
      const b = new ParameterBinder({ strategy: 'keepPlaceholder' });
      expect(b.bind({ template: '[${x}]' })).toBe('[${x}]');
    });

    it('error envelope includes parameter and template', () => {
      const b = new ParameterBinder();
      try {
        b.bind({ template: '${foo.bar}' });
      } catch (e) {
        expect(e).toBeInstanceOf(ParameterBindingError);
        const err = e as ParameterBindingError;
        expect(err.parameter).toBe('foo.bar');
        expect(err.template).toBe('${foo.bar}');
      }
    });
  });

  describe('bindMap()', () => {
    const b = new ParameterBinder();

    it('binds string leaves recursively', () => {
      const out = b.bindMap({
        data: {
          name: '${user}',
          nested: { greeting: 'Hi ${user}' },
          list: ['${user}', 42],
        },
        context: { user: 'Eve' },
      });
      expect(out).toEqual({
        name: 'Eve',
        nested: { greeting: 'Hi Eve' },
        list: ['Eve', 42],
      });
    });

    it('passes through non-string leaves', () => {
      const out = b.bindMap({
        data: { n: 1, b: true, n2: null, undef: undefined },
        context: {},
      });
      expect(out).toEqual({ n: 1, b: true, n2: null, undef: undefined });
    });
  });

  describe('extractParameters / hasParameters', () => {
    it('extracts unique parameters in order', () => {
      expect(ParameterBinder.extractParameters('${a} and ${b.c}')).toEqual(['a', 'b.c']);
    });

    it('returns empty array for plain text', () => {
      expect(ParameterBinder.extractParameters('plain')).toEqual([]);
    });

    it('returns false for hasParameters on plain text', () => {
      expect(ParameterBinder.hasParameters('plain')).toBe(false);
      expect(ParameterBinder.hasParameters('')).toBe(false);
      expect(ParameterBinder.hasParameters('${x}')).toBe(true);
    });
  });
});
