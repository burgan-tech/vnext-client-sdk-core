// ─────────────────────────────────────────────────────────────────────────
// Browser history ↔ page-router history binding (web adapter).
//
// The router keeps its OWN history stack (getHistory/goBack/goForward). Without
// this binding the browser's Back button unloads the SPA (full refresh); with
// it, Back/Forward drive router.goBack()/goForward() instead, keeping the two
// stacks in lock-step and reflecting the active route in the URL hash.
//
// Loop-safe: an `applying` guard marks the window in which WE are driving the
// browser (mirroring an in-app goBack) or the router (reacting to a popstate),
// so the counterpart handler ignores the echo.
// ─────────────────────────────────────────────────────────────────────────
import { getCurrentScope, onScopeDispose } from 'vue';
import type { IPageRouter } from 'page-router';

export interface BrowserHistoryOptions {
  /** URL-hash prefix written per route so the address bar reflects the page. Default '#/'. */
  hashPrefix?: string;
}

interface PrState {
  prDepth: number;
}

/**
 * Bind the browser Back/Forward buttons to a page-router's history stack.
 * Returns a dispose function (also auto-disposed if called inside a Vue scope).
 */
export function bindBrowserHistory(
  router: IPageRouter,
  opts: BrowserHistoryOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const hashPrefix = opts.hashPrefix ?? '#/';

  let depth = router.getHistory().length;
  // True while we are the ones driving the browser or the router — breaks the
  // popstate ⇄ onHistoryChanged echo loop.
  let applying = false;

  const topKey = (): string => {
    const h = router.getHistory();
    return (h[h.length - 1]?.item?.key as string | undefined) ?? '';
  };
  const urlFor = (key: string): string =>
    key
      ? window.location.pathname + window.location.search + hashPrefix + encodeURIComponent(key)
      : window.location.href;

  // Seed the current entry so the first Back has somewhere to return to.
  window.history.replaceState({ prDepth: depth } satisfies PrState, '', urlFor(topKey()));

  const offHistory = router.onHistoryChanged((h) => {
    if (applying) return;
    const nd = h.length;
    if (nd > depth) {
      // Forward navigation happened in-app → mirror as browser pushState(s).
      for (let d = depth + 1; d <= nd; d++) {
        window.history.pushState({ prDepth: d } satisfies PrState, '', urlFor(topKey()));
      }
    } else if (nd < depth) {
      // In-app goBack (a UI back button, not the browser) → move the browser
      // back the same number of entries; the resulting popstate is ours.
      applying = true;
      window.history.go(nd - depth);
    }
    depth = nd;
  });

  const onPop = (e: PopStateEvent): void => {
    if (applying) {
      applying = false;
      depth = router.getHistory().length;
      return;
    }
    const state = e.state as Partial<PrState> | null;
    const target = typeof state?.prDepth === 'number' ? state.prDepth : 1;
    void (async () => {
      applying = true;
      try {
        for (let steps = depth - target; steps > 0 && router.canGoBack(); steps--) {
          await router.goBack();
        }
        for (let steps = target - depth; steps > 0 && router.canGoForward(); steps--) {
          await router.goForward();
        }
      } finally {
        applying = false;
        depth = router.getHistory().length;
      }
    })();
  };

  window.addEventListener('popstate', onPop);

  const dispose = (): void => {
    offHistory.unsubscribe();
    window.removeEventListener('popstate', onPop);
  };
  // Auto-dispose when bound inside a component/effect scope; otherwise the
  // caller owns the returned dispose fn (no warning when there is no scope).
  if (getCurrentScope()) onScopeDispose(dispose);
  return dispose;
}
