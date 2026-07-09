import { describe, expect, it, vi } from 'vitest';
import { TabManager } from '../src/internal/tab-manager.js';
import { createLogger } from '../src/internal/logger.js';
import { RouteLifetime, type NavigationItem, type OnLog, type ViewSurface } from '../src/index.js';

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
  return { handleKey, mount: { __mock: handleKey } };
}

function fixedClock() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, n++)).toISOString();
}

describe('TabManager — open / activate', () => {
  it('starts empty with no active tab', () => {
    const m = new TabManager({ now: fixedClock() });
    expect(m.listTabs()).toEqual([]);
    expect(m.getActiveTab()).toBeNull();
  });

  it('addTab inserts tab with isActive=false and timestamps populated', () => {
    const m = new TabManager({ now: fixedClock() });
    const t = m.addTab({
      tabKey: 't1',
      item: item('r'),
      payload: { a: 1 },
      surface: surface('t1'),
    });
    expect(t.tabKey).toBe('t1');
    expect(t.isActive).toBe(false);
    expect(t.isPinned).toBe(false);
    expect(t.isClosable).toBe(true);
    expect(t.isDirty).toBe(false);
    expect(typeof t.openedAt).toBe('string');
    expect(t.lastActivatedAt).toBe(t.openedAt);
    expect(m.listTabs()).toHaveLength(1);
  });

  it('addTab respects explicit pinned/closable overrides', () => {
    const m = new TabManager({ now: fixedClock() });
    const t = m.addTab({
      tabKey: 't1',
      item: item('r'),
      payload: {},
      surface: surface('t1'),
      isPinned: true,
      isClosable: false,
    });
    expect(t.isPinned).toBe(true);
    expect(t.isClosable).toBe(false);
  });

  it('activateTab toggles isActive and updates lastActivatedAt; deactivates the previous one', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.addTab({ tabKey: 't2', item: item('r'), payload: {}, surface: surface('t2') });

    const r1 = m.activateTab('t1');
    expect(r1.activated.tabKey).toBe('t1');
    expect(r1.deactivated).toBeNull();
    expect(m.getActiveTab()?.tabKey).toBe('t1');

    const r2 = m.activateTab('t2');
    expect(r2.activated.tabKey).toBe('t2');
    expect(r2.deactivated?.tabKey).toBe('t1');
    expect(m.findByKey('t1')?.isActive).toBe(false);
    expect(m.findByKey('t2')?.isActive).toBe(true);
    expect(m.getActiveTab()?.tabKey).toBe('t2');
  });

  it('activateTab on the already-active tab still bumps lastActivatedAt', () => {
    const clock = fixedClock();
    const m = new TabManager({ now: clock });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.activateTab('t1');
    const before = m.findByKey('t1')!.lastActivatedAt;

    m.activateTab('t1');
    const after = m.findByKey('t1')!.lastActivatedAt;
    expect(after > before).toBe(true);
  });

  it('activateTab on a missing key throws', () => {
    const m = new TabManager({ now: fixedClock() });
    expect(() => m.activateTab('nope')).toThrow(/tab-not-found/);
  });
});

describe('TabManager — close', () => {
  it('removes the tab and selects most-recently-activated remaining tab as next active', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.addTab({ tabKey: 't2', item: item('r'), payload: {}, surface: surface('t2') });
    m.addTab({ tabKey: 't3', item: item('r'), payload: {}, surface: surface('t3') });
    m.activateTab('t1');
    m.activateTab('t2');
    m.activateTab('t3');

    const r = m.closeTab('t3');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.closed.tabKey).toBe('t3');
      expect(r.nextActive?.tabKey).toBe('t2');
    }
    expect(m.listTabs().map((t) => t.tabKey)).toEqual(['t1', 't2']);
  });

  it('closing a non-active tab leaves the active tab unchanged', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.addTab({ tabKey: 't2', item: item('r'), payload: {}, surface: surface('t2') });
    m.activateTab('t2');
    const r = m.closeTab('t1');
    expect(r.ok).toBe(true);
    expect(m.getActiveTab()?.tabKey).toBe('t2');
  });

  it('closing the only tab leaves no active tab', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.activateTab('t1');
    const r = m.closeTab('t1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextActive).toBeNull();
    expect(m.getActiveTab()).toBeNull();
    expect(m.listTabs()).toEqual([]);
  });

  it('refuses to close a tab where isClosable is false (logs tab-not-closable)', () => {
    const onLog = vi.fn<OnLog>();
    const m = new TabManager({ now: fixedClock(), logger: createLogger(onLog) });
    m.addTab({
      tabKey: 't1',
      item: item('r'),
      payload: {},
      surface: surface('t1'),
      isClosable: false,
    });
    const r = m.closeTab('t1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('tab-not-closable');
    expect(m.findByKey('t1')).toBeTruthy();
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      'tab-not-closable',
      undefined,
      expect.objectContaining({ tabKey: 't1' }),
    );
  });

  it('returns ok:false reason:tab-not-found for missing key', () => {
    const m = new TabManager({ now: fixedClock() });
    const r = m.closeTab('ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('tab-not-found');
  });
});

describe('TabManager — pin / dirty / refresh', () => {
  it('pinTab sets isPinned=true and isClosable=false', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.pinTab('t1');
    const t = m.findByKey('t1')!;
    expect(t.isPinned).toBe(true);
    expect(t.isClosable).toBe(false);
  });

  it('unpinTab sets isPinned=false and isClosable=true', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({
      tabKey: 't1',
      item: item('r'),
      payload: {},
      surface: surface('t1'),
      isPinned: true,
      isClosable: false,
    });
    m.unpinTab('t1');
    const t = m.findByKey('t1')!;
    expect(t.isPinned).toBe(false);
    expect(t.isClosable).toBe(true);
  });

  it('setDirty(true|false) toggles isDirty', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({ tabKey: 't1', item: item('r'), payload: {}, surface: surface('t1') });
    m.setDirty('t1', true);
    expect(m.findByKey('t1')?.isDirty).toBe(true);
    m.setDirty('t1', false);
    expect(m.findByKey('t1')?.isDirty).toBe(false);
  });

  it('refreshTab replaces item + payload + surface but keeps tabKey, pin/dirty, openedAt', () => {
    const m = new TabManager({ now: fixedClock() });
    m.addTab({
      tabKey: 't1',
      item: item('r'),
      payload: { a: 1 },
      surface: surface('t1-old'),
    });
    const openedAtSnapshot = m.findByKey('t1')!.openedAt;
    m.activateTab('t1');
    m.setDirty('t1', true);
    const lastActivatedSnapshot = m.findByKey('t1')!.lastActivatedAt;

    const newItem = item('r');
    const newSurface = surface('t1-new');
    const out = m.refreshTab('t1', {
      item: newItem,
      payload: { a: 2 },
      surface: newSurface,
    });

    const t = m.findByKey('t1')!;
    expect(out).toBe(t);
    expect(t.item).toBe(newItem);
    expect(t.payload).toEqual({ a: 2 });
    expect(t.surface).toBe(newSurface);
    expect(t.openedAt).toBe(openedAtSnapshot);
    expect(t.isDirty).toBe(true);
    expect(t.lastActivatedAt > lastActivatedSnapshot).toBe(true);
  });

  it('all mutators throw tab-not-found on missing key', () => {
    const m = new TabManager({ now: fixedClock() });
    expect(() => m.pinTab('x')).toThrow(/tab-not-found/);
    expect(() => m.unpinTab('x')).toThrow(/tab-not-found/);
    expect(() => m.setDirty('x', true)).toThrow(/tab-not-found/);
    expect(() =>
      m.refreshTab('x', { item: item('r'), payload: {}, surface: surface('x') }),
    ).toThrow(/tab-not-found/);
  });
});
