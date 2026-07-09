import type { HistoryEntry, NavigationItem } from '../types.js';

/**
 * Pure, browser-style chronological history.
 *
 * Semantics:
 *
 * - `entries` holds chronological state; `cursor` points at the currently
 *   active entry (`-1` when empty).
 * - `push(e)` appends and **drops the forward tail** (classic browser
 *   navigation), then advances the cursor.
 * - `back()` / `forward()` walk the cursor and return the new current entry,
 *   or `null` when at the boundary (caller should signal `'history-bound'`).
 * - `markClosedByTabKey(tk)` flips `closed: true` on matching entries; they
 *   stay in the stack so `goBack` can still revisit (re-open) them.
 * - SDI history-root anchoring (homepage) is achieved upstream by
 *   `clear() + push(homepageEntry)` — `canGoBack` then naturally returns
 *   `false` until another navigation pushes a follow-up entry.
 */
export class HistoryManager {
  private readonly entries: HistoryEntry[] = [];
  private cursor = -1;

  getEntries(): ReadonlyArray<HistoryEntry> {
    return this.entries.slice();
  }

  getCurrent(): HistoryEntry | null {
    if (this.cursor < 0) return null;
    return this.entries[this.cursor] ?? null;
  }

  canGoBack(): boolean {
    return this.cursor > 0;
  }

  canGoForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1;
  }

  push(entry: HistoryEntry): void {
    if (this.cursor < this.entries.length - 1) {
      this.entries.splice(this.cursor + 1);
    }
    this.entries.push(entry);
    this.cursor = this.entries.length - 1;
  }

  back(): HistoryEntry | null {
    if (!this.canGoBack()) return null;
    this.cursor -= 1;
    return this.entries[this.cursor] ?? null;
  }

  forward(): HistoryEntry | null {
    if (!this.canGoForward()) return null;
    this.cursor += 1;
    return this.entries[this.cursor] ?? null;
  }

  clear(): void {
    this.entries.length = 0;
    this.cursor = -1;
  }

  /**
   * Mark every entry whose `tabKey` matches as closed (does **not** remove).
   * Used when a tab is destroyed by `closeTab` or by a shell-mode sweep.
   */
  markClosedByTabKey(tabKey: string): void {
    for (const e of this.entries) {
      if (e.tabKey === tabKey) {
        e.closed = true;
      }
    }
  }

  /**
   * Re-runs `transform(entry)` on every entry; if the result is non-null, the
   * entry's `item` is replaced in place. Used by `setLocale` to re-resolve
   * NavigationItem snapshots without rebuilding the stack. Caller decides per
   * entry (e.g. skip when route was removed from the registry).
   */
  replaceItems(transform: (entry: HistoryEntry) => NavigationItem | null): void {
    for (const e of this.entries) {
      const next = transform(e);
      if (next !== null) e.item = next;
    }
  }
}
