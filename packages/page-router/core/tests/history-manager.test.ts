import { describe, expect, it } from 'vitest';
import { HistoryManager } from '../src/internal/history-manager.js';
import { ShellMode, RouteLifetime, type HistoryEntry } from '../src/index.js';

function entry(
  partial: Partial<HistoryEntry> & { tabKey?: string } = {},
): HistoryEntry {
  return {
    at: partial.at ?? new Date(0).toISOString(),
    shellMode: partial.shellMode ?? ShellMode.mdi,
    ...(partial.tabKey !== undefined ? { tabKey: partial.tabKey } : {}),
    item: partial.item ?? {
      key: 'r',
      lifetime: RouteLifetime.singleton,
      config: {},
      resolvedData: [],
      locale: 'tr',
    },
    payload: partial.payload ?? {},
    ...(partial.closed !== undefined ? { closed: partial.closed } : {}),
  };
}

describe('HistoryManager — empty state', () => {
  it('reports zero entries and false navigation flags', () => {
    const h = new HistoryManager();
    expect(h.getEntries()).toEqual([]);
    expect(h.getCurrent()).toBeNull();
    expect(h.canGoBack()).toBe(false);
    expect(h.canGoForward()).toBe(false);
  });

  it('back / forward return null with no entries', () => {
    const h = new HistoryManager();
    expect(h.back()).toBeNull();
    expect(h.forward()).toBeNull();
  });
});

describe('HistoryManager — push', () => {
  it('appends and advances cursor; canGoBack updates after the second push', () => {
    const h = new HistoryManager();
    const a = entry({ tabKey: 'a' });
    h.push(a);
    expect(h.getCurrent()).toBe(a);
    expect(h.canGoBack()).toBe(false);

    const b = entry({ tabKey: 'b' });
    h.push(b);
    expect(h.getCurrent()).toBe(b);
    expect(h.canGoBack()).toBe(true);
    expect(h.canGoForward()).toBe(false);
  });

  it('drops the forward stack when pushing after a back()', () => {
    const h = new HistoryManager();
    const a = entry({ tabKey: 'a' });
    const b = entry({ tabKey: 'b' });
    const c = entry({ tabKey: 'c' });
    h.push(a);
    h.push(b);
    h.back();
    h.push(c);

    expect(h.getEntries().map((e) => e.tabKey)).toEqual(['a', 'c']);
    expect(h.canGoForward()).toBe(false);
  });
});

describe('HistoryManager — back / forward', () => {
  it('back walks the cursor backwards and returns the new current', () => {
    const h = new HistoryManager();
    const a = entry({ tabKey: 'a' });
    const b = entry({ tabKey: 'b' });
    h.push(a);
    h.push(b);

    expect(h.back()).toBe(a);
    expect(h.getCurrent()).toBe(a);
    expect(h.canGoBack()).toBe(false);
    expect(h.canGoForward()).toBe(true);
  });

  it('back at the root returns null without mutating', () => {
    const h = new HistoryManager();
    const a = entry({ tabKey: 'a' });
    h.push(a);
    expect(h.back()).toBeNull();
    expect(h.getCurrent()).toBe(a);
  });

  it('forward replays the dropped tail; null at the head', () => {
    const h = new HistoryManager();
    const a = entry({ tabKey: 'a' });
    const b = entry({ tabKey: 'b' });
    h.push(a);
    h.push(b);
    h.back();

    expect(h.forward()).toBe(b);
    expect(h.canGoForward()).toBe(false);
    expect(h.forward()).toBeNull();
  });
});

describe('HistoryManager — closed flagging', () => {
  it('markClosedByTabKey marks every entry whose tabKey matches without removing them', () => {
    const h = new HistoryManager();
    h.push(entry({ tabKey: 't1' }));
    h.push(entry({ tabKey: 't2' }));
    h.push(entry({ tabKey: 't1' }));

    h.markClosedByTabKey('t1');
    const entries = h.getEntries();
    expect(entries.map((e) => e.closed === true)).toEqual([true, false, true]);
    // Cursor / forward/back semantics unchanged
    expect(h.getCurrent()?.tabKey).toBe('t1');
  });

  it('markClosedByTabKey is a no-op when nothing matches', () => {
    const h = new HistoryManager();
    h.push(entry({ tabKey: 't1' }));
    h.markClosedByTabKey('ghost');
    expect(h.getEntries().every((e) => e.closed === undefined)).toBe(true);
  });
});

describe('HistoryManager — clear', () => {
  it('clear empties entries and resets navigation flags', () => {
    const h = new HistoryManager();
    h.push(entry({ tabKey: 'a' }));
    h.push(entry({ tabKey: 'b' }));

    h.clear();
    expect(h.getEntries()).toEqual([]);
    expect(h.getCurrent()).toBeNull();
    expect(h.canGoBack()).toBe(false);
    expect(h.canGoForward()).toBe(false);
  });
});

describe('HistoryManager — readonly snapshot', () => {
  it('getEntries returns a defensive copy that does not leak the internal array', () => {
    const h = new HistoryManager();
    h.push(entry({ tabKey: 'a' }));
    const snap = h.getEntries() as HistoryEntry[];
    snap.push(entry({ tabKey: 'leak' }));
    expect(h.getEntries()).toHaveLength(1);
  });
});
