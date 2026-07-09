import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/internal/overlay-stack.js';
import { RouteLifetime, type NavigationItem, type ViewSurface } from '../src/index.js';

function item(key: string): NavigationItem {
  return {
    key,
    lifetime: RouteLifetime.singleton,
    config: {},
    resolvedData: [],
    locale: 'tr',
  };
}

function surface(handleKey: string): ViewSurface {
  return { handleKey, mount: { handleKey } };
}

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)).toISOString();
}

describe('OverlayStack — push / top', () => {
  it('starts empty with no top', () => {
    const s = new OverlayStack({ now: fixedClock() });
    expect(s.getStack()).toEqual([]);
    expect(s.getTop()).toBeNull();
  });

  it('push assigns sequential stackIndex starting at 0', () => {
    const s = new OverlayStack({ now: fixedClock() });
    const a = s.push({
      overlayKey: 'a',
      item: item('r'),
      payload: {},
      surface: surface('a'),
      underlayTabKey: 't1',
    });
    expect(a.stackIndex).toBe(0);
    expect(a.underlayTabKey).toBe('t1');

    const b = s.push({
      overlayKey: 'b',
      item: item('r'),
      payload: {},
      surface: surface('b'),
    });
    expect(b.stackIndex).toBe(1);
    expect(s.getTop()?.overlayKey).toBe('b');
  });

  it('refuses a duplicate overlayKey', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    expect(() =>
      s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') }),
    ).toThrow(/overlay-already-exists/);
  });
});

describe('OverlayStack — dismiss', () => {
  it('dismissTop pops the highest-index overlay', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    s.push({ overlayKey: 'b', item: item('r'), payload: {}, surface: surface('b') });
    const popped = s.dismissTop();
    expect(popped?.overlayKey).toBe('b');
    expect(s.getStack().map((o) => o.overlayKey)).toEqual(['a']);
  });

  it('dismissTop on an empty stack returns null', () => {
    const s = new OverlayStack({ now: fixedClock() });
    expect(s.dismissTop()).toBeNull();
  });

  it('dismissByKey removes a middle overlay and renumbers stackIndex', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    s.push({ overlayKey: 'b', item: item('r'), payload: {}, surface: surface('b') });
    s.push({ overlayKey: 'c', item: item('r'), payload: {}, surface: surface('c') });

    const removed = s.dismissByKey('b');
    expect(removed?.overlayKey).toBe('b');
    const remaining = s.getStack();
    expect(remaining.map((o) => o.overlayKey)).toEqual(['a', 'c']);
    expect(remaining.map((o) => o.stackIndex)).toEqual([0, 1]);
    expect(s.getTop()?.overlayKey).toBe('c');
  });

  it('dismissByKey for an unknown key returns null and leaves the stack unchanged', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    expect(s.dismissByKey('ghost')).toBeNull();
    expect(s.getStack()).toHaveLength(1);
  });
});

describe('OverlayStack — clear', () => {
  it('clear empties the stack and returns the dismissed overlays in topdown order (top first)', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    s.push({ overlayKey: 'b', item: item('r'), payload: {}, surface: surface('b') });
    s.push({ overlayKey: 'c', item: item('r'), payload: {}, surface: surface('c') });

    const dismissed = s.clear();
    expect(dismissed.map((o) => o.overlayKey)).toEqual(['c', 'b', 'a']);
    expect(s.getStack()).toEqual([]);
    expect(s.getTop()).toBeNull();
  });
});

describe('OverlayStack — find / read', () => {
  it('findByKey returns the overlay or null', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    expect(s.findByKey('a')?.overlayKey).toBe('a');
    expect(s.findByKey('zzz')).toBeNull();
  });

  it('getStack returns a defensive copy', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    const snap = s.getStack() as unknown as Array<unknown>;
    snap.pop();
    expect(s.getStack()).toHaveLength(1);
  });
});

describe('OverlayStack — moveToTop', () => {
  it('moves the matching entry to the top and renumbers stackIndex', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    s.push({ overlayKey: 'b', item: item('r'), payload: {}, surface: surface('b') });
    s.push({ overlayKey: 'c', item: item('r'), payload: {}, surface: surface('c') });

    const moved = s.moveToTop('a');
    expect(moved?.overlayKey).toBe('a');
    expect(s.getStack().map((o) => o.overlayKey)).toEqual(['b', 'c', 'a']);
    expect(s.getStack().map((o) => o.stackIndex)).toEqual([0, 1, 2]);
    expect(s.getTop()?.overlayKey).toBe('a');
  });

  it('is a no-op when the entry is already on top', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    s.push({ overlayKey: 'b', item: item('r'), payload: {}, surface: surface('b') });

    const before = s.getStack().map((o) => o.overlayKey);
    const moved = s.moveToTop('b');
    expect(moved?.overlayKey).toBe('b');
    expect(s.getStack().map((o) => o.overlayKey)).toEqual(before);
    expect(s.getStack().map((o) => o.stackIndex)).toEqual([0, 1]);
  });

  it('returns null for an unknown key without mutating the stack', () => {
    const s = new OverlayStack({ now: fixedClock() });
    s.push({ overlayKey: 'a', item: item('r'), payload: {}, surface: surface('a') });
    const moved = s.moveToTop('zzz');
    expect(moved).toBeNull();
    expect(s.getStack().map((o) => o.overlayKey)).toEqual(['a']);
  });
});

describe('OverlayStack — refreshOverlay', () => {
  it('replaces item, payload, and surface for an existing overlay', () => {
    const s = new OverlayStack({ now: fixedClock() });
    const original = s.push({
      overlayKey: 'a',
      item: item('r'),
      payload: { v: 1 },
      surface: surface('a'),
    });
    const newItem = item('r');
    const newSurface = surface('a');

    const updated = s.refreshOverlay('a', {
      item: newItem,
      payload: { v: 2 },
      surface: newSurface,
    });
    expect(updated?.overlayKey).toBe('a');
    expect(updated?.payload).toEqual({ v: 2 });
    expect(updated?.surface).toBe(newSurface);
    // openedAt + stackIndex preserved.
    expect(updated?.openedAt).toBe(original.openedAt);
    expect(updated?.stackIndex).toBe(original.stackIndex);
  });

  it('returns null for an unknown key', () => {
    const s = new OverlayStack({ now: fixedClock() });
    const out = s.refreshOverlay('nope', {
      item: item('r'),
      payload: {},
      surface: surface('x'),
    });
    expect(out).toBeNull();
  });
});
