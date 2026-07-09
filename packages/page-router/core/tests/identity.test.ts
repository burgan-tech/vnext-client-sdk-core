import { describe, expect, it, vi } from 'vitest';
import {
  findSingletonMatch,
  matchPayloadQuery,
  matchesPrimitiveFilter,
} from '../src/internal/identity.js';
import { createLogger } from '../src/internal/logger.js';
import { RouteLifetime, type OnLog, type OpenTab } from '../src/index.js';

function tab(
  tabKey: string,
  routeKey: string,
  payload: Record<string, unknown>,
): OpenTab {
  return {
    tabKey,
    item: {
      key: routeKey,
      lifetime: RouteLifetime.singleton,
      config: {},
      resolvedData: [],
      locale: 'tr',
    },
    payload,
    surface: { handleKey: tabKey, mount: null },
    openedAt: new Date(0).toISOString(),
    lastActivatedAt: new Date(0).toISOString(),
    isActive: false,
    isDirty: false,
    isPinned: false,
    isClosable: true,
  };
}

describe('matchesPrimitiveFilter', () => {
  it('returns true when no fields are specified', () => {
    expect(matchesPrimitiveFilter({}, {}, [], { mode: 'singleton' })).toBe(true);
  });

  it('returns true for a single matching primitive field', () => {
    const ok = matchesPrimitiveFilter(
      { accountNo: 'A' },
      { accountNo: 'A' },
      ['accountNo'],
      { mode: 'singleton' },
    );
    expect(ok).toBe(true);
  });

  it('returns false when a primitive field differs', () => {
    expect(
      matchesPrimitiveFilter({ accountNo: 'A' }, { accountNo: 'B' }, ['accountNo'], {
        mode: 'singleton',
      }),
    ).toBe(false);
  });

  it('AND-reduces multiple primitive fields', () => {
    expect(
      matchesPrimitiveFilter(
        { a: 1, b: 'x' },
        { a: 1, b: 'x' },
        ['a', 'b'],
        { mode: 'singleton' },
      ),
    ).toBe(true);
    expect(
      matchesPrimitiveFilter(
        { a: 1, b: 'x' },
        { a: 1, b: 'y' },
        ['a', 'b'],
        { mode: 'singleton' },
      ),
    ).toBe(false);
  });

  it('treats null as primitive (matches null vs null, fails null vs string)', () => {
    expect(
      matchesPrimitiveFilter({ a: null }, { a: null }, ['a'], { mode: 'singleton' }),
    ).toBe(true);
    expect(
      matchesPrimitiveFilter({ a: 'x' }, { a: null }, ['a'], { mode: 'singleton' }),
    ).toBe(false);
  });

  it('returns false and warns missing-value when target field is undefined', () => {
    const onLog = vi.fn<OnLog>();
    const ok = matchesPrimitiveFilter(
      { a: 'A' },
      { a: undefined },
      ['a'],
      { mode: 'singleton', logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(ok).toBe(false);
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'singleton-key-missing-value',
      undefined,
      expect.objectContaining({ routeKey: 'r', name: 'a' }),
    );
  });

  it('ignores a non-primitive target field but still evaluates the rest', () => {
    const onLog = vi.fn<OnLog>();
    const ok = matchesPrimitiveFilter(
      { a: { x: 1 }, b: 'B' },
      { a: { x: 1 }, b: 'B' },
      ['a', 'b'],
      { mode: 'singleton', logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(ok).toBe(true);
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'singleton-key-non-primitive',
      undefined,
      expect.objectContaining({ routeKey: 'r', name: 'a', type: 'object' }),
    );
  });

  it('uses find-key-* warn topics when mode is "find"', () => {
    const onLog = vi.fn<OnLog>();
    matchesPrimitiveFilter({ a: [1] }, { a: [1] }, ['a'], {
      mode: 'find',
      logger: createLogger(onLog),
      routeKey: 'r',
    });
    matchesPrimitiveFilter({}, { a: undefined }, ['a'], {
      mode: 'find',
      logger: createLogger(onLog),
      routeKey: 'r',
    });
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'find-key-non-primitive',
      undefined,
      expect.any(Object),
    );
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'find-key-missing-value',
      undefined,
      expect.any(Object),
    );
  });
});

describe('findSingletonMatch', () => {
  it('returns null when there are no candidates', () => {
    expect(
      findSingletonMatch([], {
        routeKey: 'r',
        singletonKey: [],
        payload: {},
      }),
    ).toBeNull();
  });

  it('returns null when no tab shares the routeKey', () => {
    const tabs = [tab('t1', 'other', {})];
    expect(
      findSingletonMatch(tabs, {
        routeKey: 'r',
        singletonKey: [],
        payload: {},
      }),
    ).toBeNull();
  });

  it('with empty singletonKey returns first routeKey-matching candidate', () => {
    const a = tab('t1', 'r', {});
    const b = tab('t2', 'r', { x: 1 });
    expect(
      findSingletonMatch([a, b], { routeKey: 'r', singletonKey: [], payload: {} }),
    ).toBe(a);
  });

  it('matches the candidate whose payload primitives equal target', () => {
    const a = tab('t1', 'r', { accountNo: 'A' });
    const b = tab('t2', 'r', { accountNo: 'B' });
    expect(
      findSingletonMatch([a, b], {
        routeKey: 'r',
        singletonKey: ['accountNo'],
        payload: { accountNo: 'B' },
      }),
    ).toBe(b);
  });

  it('returns null when no candidate primitive matches (transient path)', () => {
    const a = tab('t1', 'r', { accountNo: 'A' });
    expect(
      findSingletonMatch([a], {
        routeKey: 'r',
        singletonKey: ['accountNo'],
        payload: { accountNo: 'X' },
      }),
    ).toBeNull();
  });

  it('warns once and returns null when target singleton field is undefined (transient fallback)', () => {
    const onLog = vi.fn<OnLog>();
    const a = tab('t1', 'r', { accountNo: 'A' });
    const result = findSingletonMatch(
      [a],
      { routeKey: 'r', singletonKey: ['accountNo'], payload: {} },
      { logger: createLogger(onLog) },
    );
    expect(result).toBeNull();
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'singleton-key-missing-value',
      undefined,
      expect.objectContaining({ routeKey: 'r', name: 'accountNo' }),
    );
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('ignores non-primitive singletonKey fields and falls back to routeKey-only matching', () => {
    const onLog = vi.fn<OnLog>();
    const a = tab('t1', 'r', { selector: { x: 1 } });
    const result = findSingletonMatch(
      [a],
      {
        routeKey: 'r',
        singletonKey: ['selector'],
        payload: { selector: { x: 2 } },
      },
      { logger: createLogger(onLog) },
    );
    expect(result).toBe(a);
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'singleton-key-non-primitive',
      undefined,
      expect.objectContaining({ name: 'selector' }),
    );
  });

  it('returns first match when multiple primitives qualify', () => {
    const a = tab('t1', 'r', { accountNo: 'A' });
    const b = tab('t2', 'r', { accountNo: 'A' });
    expect(
      findSingletonMatch([a, b], {
        routeKey: 'r',
        singletonKey: ['accountNo'],
        payload: { accountNo: 'A' },
      }),
    ).toBe(a);
  });
});

describe('matchPayloadQuery (findTabs / findOverlays filter)', () => {
  const tabs: OpenTab[] = [
    tab('t1', 'tx', { accountNo: 'A' }),
    tab('t2', 'tx', { accountNo: 'B' }),
    tab('t3', 'other', { accountNo: 'A' }),
  ];

  it('returns every tab matching routeKey when no payload filter is supplied', () => {
    const out = matchPayloadQuery(tabs, { routeKey: 'tx' });
    expect(out.map((t) => t.tabKey)).toEqual(['t1', 't2']);
  });

  it('returns the tabs whose payload matches every primitive query field', () => {
    const out = matchPayloadQuery(tabs, {
      routeKey: 'tx',
      payload: { accountNo: 'B' },
    });
    expect(out.map((t) => t.tabKey)).toEqual(['t2']);
  });

  it('returns empty array when no tab matches', () => {
    expect(
      matchPayloadQuery(tabs, { routeKey: 'tx', payload: { accountNo: 'Z' } }),
    ).toEqual([]);
    expect(matchPayloadQuery(tabs, { routeKey: 'nope' })).toEqual([]);
  });

  it('supports OpenOverlay shape (anything with `item.key` + `payload`)', () => {
    const overlays = [
      {
        overlayKey: 'o1',
        item: tabs[0]!.item,
        payload: { accountNo: 'A' },
      },
      {
        overlayKey: 'o2',
        item: tabs[1]!.item,
        payload: { accountNo: 'B' },
      },
    ];
    const out = matchPayloadQuery(overlays, {
      routeKey: 'tx',
      payload: { accountNo: 'B' },
    });
    expect(out).toHaveLength(1);
    expect((out[0] as { overlayKey: string }).overlayKey).toBe('o2');
  });
});
