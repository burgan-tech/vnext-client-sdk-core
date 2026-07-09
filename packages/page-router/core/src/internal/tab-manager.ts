import type { NavigationItem, OpenTab, ViewSurface } from '../types.js';
import type { Logger } from './logger.js';

export interface TabManagerOptions {
  now?: () => string;
  logger?: Logger;
}

export interface AddTabSpec {
  tabKey: string;
  item: NavigationItem;
  payload: Record<string, unknown>;
  surface: ViewSurface;
  isPinned?: boolean;
  isClosable?: boolean;
  isDirty?: boolean;
}

export interface ActivateResult {
  activated: OpenTab;
  deactivated: OpenTab | null;
}

export type CloseResult =
  | { ok: true; closed: OpenTab; nextActive: OpenTab | null }
  | { ok: false; reason: 'tab-not-found' | 'tab-not-closable' };

export interface RefreshSpec {
  item: NavigationItem;
  payload: Record<string, unknown>;
  surface: ViewSurface;
}

/**
 * Pure state container for MDI tabs. Does **not** invoke surface lifecycle
 * (`createViewSurface` / `disposeViewSurface`) — those calls remain in the
 * navigate pipeline. The manager just owns the bookkeeping (insertion order,
 * active selection, pin/dirty/closable flags, payload/surface refresh).
 *
 * Conventions:
 *
 * - `isClosable === !isPinned` is enforced by `pinTab`/`unpinTab`. Homepage
 *   lock semantics live one layer up (HomepageManager) and the page router
 *   gates `pinTab`/`unpinTab`/`closeTab` against the lock before delegating
 *   here.
 * - `closeTab` against a non-closable tab logs `tab-not-closable` and returns
 *   `ok:false` (no state mutation).
 * - When the active tab closes, the next active is the remaining tab with the
 *   most recent `lastActivatedAt`, or `null` if the manager is now empty.
 */
export class TabManager {
  private readonly tabs: OpenTab[] = [];
  private activeKey: string | null = null;
  private readonly now: () => string;
  private readonly logger?: Logger;

  constructor(opts: TabManagerOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    if (opts.logger) this.logger = opts.logger;
  }

  listTabs(): ReadonlyArray<OpenTab> {
    return this.tabs;
  }

  findByKey(tabKey: string): OpenTab | null {
    return this.tabs.find((t) => t.tabKey === tabKey) ?? null;
  }

  getActiveTab(): OpenTab | null {
    if (!this.activeKey) return null;
    return this.findByKey(this.activeKey);
  }

  addTab(spec: AddTabSpec): OpenTab {
    if (this.findByKey(spec.tabKey)) {
      throw new Error(`tab-already-exists: ${spec.tabKey}`);
    }
    const ts = this.now();
    const isPinned = spec.isPinned ?? false;
    const isClosable = spec.isClosable ?? !isPinned;
    const tab: OpenTab = {
      tabKey: spec.tabKey,
      item: spec.item,
      payload: spec.payload,
      surface: spec.surface,
      openedAt: ts,
      lastActivatedAt: ts,
      isActive: false,
      isDirty: spec.isDirty ?? false,
      isPinned,
      isClosable,
    };
    this.tabs.push(tab);
    return tab;
  }

  activateTab(tabKey: string): ActivateResult {
    const target = this.findByKey(tabKey);
    if (!target) {
      throw new Error(`tab-not-found: ${tabKey}`);
    }
    let deactivated: OpenTab | null = null;
    if (this.activeKey && this.activeKey !== tabKey) {
      const prev = this.findByKey(this.activeKey);
      if (prev) {
        prev.isActive = false;
        deactivated = prev;
      }
    }
    target.isActive = true;
    target.lastActivatedAt = this.now();
    this.activeKey = tabKey;
    return { activated: target, deactivated };
  }

  closeTab(tabKey: string): CloseResult {
    const idx = this.tabs.findIndex((t) => t.tabKey === tabKey);
    if (idx < 0) {
      return { ok: false, reason: 'tab-not-found' };
    }
    const target = this.tabs[idx]!;
    if (!target.isClosable) {
      this.logger?.warn('tab-not-closable', undefined, { tabKey });
      return { ok: false, reason: 'tab-not-closable' };
    }
    this.tabs.splice(idx, 1);

    let nextActive: OpenTab | null = null;
    if (this.activeKey === tabKey) {
      this.activeKey = null;
      // Pick the tab with the most recent lastActivatedAt (MRU).
      let best: OpenTab | null = null;
      for (const t of this.tabs) {
        if (!best || t.lastActivatedAt > best.lastActivatedAt) {
          best = t;
        }
      }
      if (best) {
        best.isActive = true;
        best.lastActivatedAt = this.now();
        this.activeKey = best.tabKey;
        nextActive = best;
      }
    }
    return { ok: true, closed: target, nextActive };
  }

  pinTab(tabKey: string): void {
    const t = this.requireTab(tabKey);
    t.isPinned = true;
    t.isClosable = false;
  }

  unpinTab(tabKey: string): void {
    const t = this.requireTab(tabKey);
    t.isPinned = false;
    t.isClosable = true;
  }

  /**
   * Homepage swap helper — independent of pin flag. The page router uses this
   * to flip a tab's closable state without touching the visual pin marker.
   */
  setClosable(tabKey: string, isClosable: boolean): void {
    this.requireTab(tabKey).isClosable = isClosable;
  }

  setDirty(tabKey: string, isDirty: boolean): void {
    this.requireTab(tabKey).isDirty = isDirty;
  }

  /**
   * Moves an existing tab to a new index in the visual order. Used by the
   * page router to keep the homepage / pinned tab parked at the leftmost
   * slot regardless of how it got created (initial `setHomepage`, swap flow,
   * SDI → MDI auto-restore). Idempotent: if the tab is already at the
   * requested index this is a no-op.
   *
   * Out-of-range targets are clamped to `[0, length-1]` rather than thrown
   * — that keeps callers (which might compute a target index from a search
   * predicate) trivially safe and matches the lenient style of the rest of
   * the manager.
   */
  moveTabToIndex(tabKey: string, targetIndex: number): void {
    const from = this.tabs.findIndex((t) => t.tabKey === tabKey);
    if (from < 0) {
      throw new Error(`tab-not-found: ${tabKey}`);
    }
    const clamped = Math.min(Math.max(0, targetIndex), this.tabs.length - 1);
    if (from === clamped) return;
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(clamped, 0, tab!);
  }

  /**
   * Replaces just the `item` snapshot (locale re-resolve scenario). Payload +
   * surface are kept as-is. Returns the updated tab or `null` if the key does
   * not exist.
   */
  replaceItem(tabKey: string, item: OpenTab['item']): OpenTab | null {
    const t = this.findByKey(tabKey);
    if (!t) return null;
    t.item = item;
    return t;
  }

  /**
   * Replaces the tab's `item`, `payload`, and `surface` while preserving
   * `tabKey`, `openedAt`, pin/dirty/closable flags. Used by `restoreMode:
   * 'refresh'` after the navigate pipeline disposes the old surface and
   * creates a new one.
   */
  refreshTab(tabKey: string, spec: RefreshSpec): OpenTab {
    const t = this.requireTab(tabKey);
    t.item = spec.item;
    t.payload = spec.payload;
    t.surface = spec.surface;
    t.lastActivatedAt = this.now();
    return t;
  }

  private requireTab(tabKey: string): OpenTab {
    const t = this.findByKey(tabKey);
    if (!t) {
      throw new Error(`tab-not-found: ${tabKey}`);
    }
    return t;
  }
}
