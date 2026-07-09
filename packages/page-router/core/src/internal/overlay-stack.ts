import type { NavigationItem, OpenOverlay, ViewSurface } from '../types.js';

export interface OverlayStackOptions {
  now?: () => string;
}

export interface PushOverlaySpec {
  overlayKey: string;
  item: NavigationItem;
  payload: Record<string, unknown>;
  surface: ViewSurface;
  underlayTabKey?: string;
}

/**
 * Pure state container for the overlay stack.
 *
 * Spec semantics:
 *
 * - `stackIndex: 0` is the bottom-most overlay; the last index is the **top**.
 * - `dismissByKey` reorders `stackIndex` on the surviving overlays so the
 *   contract (0..N-1, contiguous) holds after any mutation.
 * - The page router decides when to call surface lifecycle hooks
 *   (`disposeViewSurface` for popped overlays); this container just owns the
 *   bookkeeping.
 */
export class OverlayStack {
  private readonly stack: OpenOverlay[] = [];
  private readonly now: () => string;

  constructor(opts: OverlayStackOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  getStack(): ReadonlyArray<OpenOverlay> {
    return this.stack.slice();
  }

  getTop(): OpenOverlay | null {
    return this.stack.length === 0 ? null : (this.stack[this.stack.length - 1] ?? null);
  }

  findByKey(overlayKey: string): OpenOverlay | null {
    return this.stack.find((o) => o.overlayKey === overlayKey) ?? null;
  }

  push(spec: PushOverlaySpec): OpenOverlay {
    if (this.findByKey(spec.overlayKey)) {
      throw new Error(`overlay-already-exists: ${spec.overlayKey}`);
    }
    const overlay: OpenOverlay = {
      overlayKey: spec.overlayKey,
      item: spec.item,
      payload: spec.payload,
      surface: spec.surface,
      openedAt: this.now(),
      stackIndex: this.stack.length,
      ...(spec.underlayTabKey !== undefined ? { underlayTabKey: spec.underlayTabKey } : {}),
    };
    this.stack.push(overlay);
    return overlay;
  }

  dismissTop(): OpenOverlay | null {
    if (this.stack.length === 0) return null;
    return this.stack.pop() ?? null;
  }

  dismissByKey(overlayKey: string): OpenOverlay | null {
    const idx = this.stack.findIndex((o) => o.overlayKey === overlayKey);
    if (idx < 0) return null;
    const [removed] = this.stack.splice(idx, 1);
    this.renumber();
    return removed ?? null;
  }

  /**
   * Reorders the stack so the entry with `overlayKey` becomes the top.
   * Returns the moved entry (with its updated `stackIndex`) or `null` if no
   * entry matches. Used by overlay-singleton fast-path / refresh — spec:
   * "stack'in o entry'sini top'a taşı".
   */
  moveToTop(overlayKey: string): OpenOverlay | null {
    const idx = this.stack.findIndex((o) => o.overlayKey === overlayKey);
    if (idx < 0) return null;
    if (idx === this.stack.length - 1) return this.stack[idx] ?? null;
    const [moved] = this.stack.splice(idx, 1);
    if (!moved) return null;
    this.stack.push(moved);
    this.renumber();
    return moved;
  }

  /**
   * Replaces the `item`, `payload`, and `surface` snapshot for an existing
   * overlay (used by overlay-singleton refresh — same `overlayKey`, freshly
   * remounted content). Returns the updated overlay or `null` if the key is
   * unknown. Caller is responsible for disposing the old surface.
   */
  refreshOverlay(
    overlayKey: string,
    spec: { item: NavigationItem; payload: Record<string, unknown>; surface: ViewSurface },
  ): OpenOverlay | null {
    const target = this.stack.find((o) => o.overlayKey === overlayKey);
    if (!target) return null;
    target.item = spec.item;
    target.payload = spec.payload;
    target.surface = spec.surface;
    return target;
  }

  /**
   * Replaces just the `item` snapshot (locale re-resolve scenario). Payload +
   * surface are kept as-is. Returns the updated overlay or `null` if the key
   * does not exist.
   */
  replaceItem(overlayKey: string, item: NavigationItem): OpenOverlay | null {
    const target = this.stack.find((o) => o.overlayKey === overlayKey);
    if (!target) return null;
    target.item = item;
    return target;
  }

  /** Pops every overlay top-down. Returns the dismissed overlays in pop order
   * (top first) so the caller can run `disposeViewSurface` in the right order. */
  clear(): OpenOverlay[] {
    const out: OpenOverlay[] = [];
    while (this.stack.length > 0) {
      const popped = this.stack.pop();
      if (popped) out.push(popped);
    }
    return out;
  }

  private renumber(): void {
    for (let i = 0; i < this.stack.length; i += 1) {
      this.stack[i]!.stackIndex = i;
    }
  }
}
