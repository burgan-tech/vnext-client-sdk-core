import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type CreateViewSurface,
  type DisposeViewSurface,
  type IPageRouter,
  type OnEvaluate,
  type OnLog,
  type OnNavigate,
  type OpenOverlay,
  type PageRouterOptions,
  type RouteDefinition,
  type RouteRegistry,
} from '../src/index.js';

/**
 * Overlay-presentation tests pin spec invariants from
 * `page-router-interface.md` §"Overlay" and §"Full-path". They cover:
 *
 * 1. Transient overlay opens on top of an active tab without changing the
 *    active tab and without writing to history.
 * 2. Multiple overlays stack with sequential `stackIndex`.
 * 3. Singleton overlay re-navigation with identity match + preserve →
 *    moveToTop, no createViewSurface, payload preserved.
 * 4. Singleton overlay re-navigation with identity match + refresh →
 *    disposeViewSurface(old) + createViewSurface(same overlayKey),
 *    moveToTop, payload replaced.
 * 5. Surface-on-overlay navigation auto-dismisses overlays.
 * 6. Overlay-on-overlay navigation does NOT dismiss the underlying overlays.
 * 7. `underlayTabKey` is captured from the active tab at push time.
 */

interface Mocks {
  onEvaluate: ReturnType<typeof vi.fn<OnEvaluate>>;
  onNavigate: ReturnType<typeof vi.fn<OnNavigate>>;
  createViewSurface: ReturnType<typeof vi.fn<CreateViewSurface>>;
  disposeViewSurface: ReturnType<typeof vi.fn<DisposeViewSurface>>;
  onLog: ReturnType<typeof vi.fn<OnLog>>;
}

function setup(routes: RouteDefinition[], extra: Partial<PageRouterOptions> = {}): {
  router: Promise<IPageRouter>;
  mocks: Mocks;
} {
  const onEvaluate: Mocks['onEvaluate'] = vi.fn(async ({ item }) => [item]);
  const onNavigate: Mocks['onNavigate'] = vi.fn(async () => undefined);
  let surfaceSeq = 0;
  const createViewSurface: Mocks['createViewSurface'] = vi.fn(
    async ({ handleKey, item }) => ({
      handleKey,
      mount: { handleKey, key: item.key, instance: ++surfaceSeq },
    }),
  );
  const disposeViewSurface: Mocks['disposeViewSurface'] = vi.fn(async () => undefined);
  const onLog: Mocks['onLog'] = vi.fn();

  const registry: RouteRegistry = { routes };
  const router = createPageRouter({
    routeRegistry: registry,
    shellMode: ShellMode.mdi,
    locale: 'tr',
    onEvaluate,
    onNavigate,
    createViewSurface,
    disposeViewSurface,
    onLog,
    ...extra,
  });
  return {
    router,
    mocks: { onEvaluate, onNavigate, createViewSurface, disposeViewSurface, onLog },
  };
}

const dashboard: RouteDefinition = {
  key: 'dashboard',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: 'Anasayfa',
};

const transientConfirm: RouteDefinition = {
  key: 'confirm',
  config: {},
  lifetime: RouteLifetime.transient,
  presentation: 'overlay',
  defaultTitle: 'Onay',
};

const singletonOverlayPreserve: RouteDefinition = {
  key: 'help',
  config: {},
  lifetime: RouteLifetime.singleton,
  presentation: 'overlay',
  restoreMode: 'preserve',
  defaultTitle: 'Yardım',
};

const singletonOverlayRefresh: RouteDefinition = {
  key: 'help-refresh',
  config: {},
  lifetime: RouteLifetime.singleton,
  presentation: 'overlay',
  restoreMode: 'refresh',
  defaultTitle: 'Yardım R',
};

const singletonOverlayPerTopic: RouteDefinition = {
  key: 'topic',
  config: {},
  lifetime: RouteLifetime.singleton,
  presentation: 'overlay',
  // Preserve so the activation-only fast-path can be observed unambiguously.
  restoreMode: 'preserve',
  singletonKey: ['topicId'],
  inputs: [{ name: 'topicId', required: true }],
  defaultTitle: { tr: 'Konu {{topicId}}', en: 'Topic {{topicId}}' },
};

describe('navigate() overlay — basic stacking', () => {
  it('opens an overlay on top of the active tab without changing the tab', async () => {
    const { router: ready, mocks } = setup([dashboard, transientConfirm]);
    const router = await ready;

    const tabResult = await router.navigate({ routeKey: 'dashboard' });
    const tabKey = tabResult.outcome === 'completed' ? tabResult.tabKey : undefined;
    expect(tabKey).toBeTruthy();

    const overlayResult = await router.navigate({ routeKey: 'confirm' });
    expect(overlayResult.outcome).toBe('completed');
    if (overlayResult.outcome === 'completed') {
      expect(overlayResult.presentation).toBe('overlay');
      expect(overlayResult.overlayKey).toBeTruthy();
      expect(overlayResult.tabKey).toBeUndefined();
    }

    expect(router.getActiveTab()?.tabKey).toBe(tabKey);
    const view = router.getActiveView();
    expect(view?.overlays).toHaveLength(1);
    expect(view?.overlays[0]?.underlayTabKey).toBe(tabKey);
    expect(view?.overlays[0]?.stackIndex).toBe(0);

    expect(router.getHistory()).toHaveLength(1);

    expect(mocks.createViewSurface).toHaveBeenCalledTimes(2);
    const calls = mocks.createViewSurface.mock.calls.map(([arg]) => arg);
    expect(calls[0]?.presentation).toBe('surface');
    expect(calls[1]?.presentation).toBe('overlay');
  });

  it('stacks multiple overlays with sequential stackIndex', async () => {
    const { router: ready } = setup([dashboard, transientConfirm]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm' });
    await router.navigate({ routeKey: 'confirm' });
    await router.navigate({ routeKey: 'confirm' });

    const overlays = router.getActiveView()?.overlays ?? [];
    expect(overlays).toHaveLength(3);
    overlays.forEach((o, idx) => expect(o.stackIndex).toBe(idx));
  });

  it('overlay-on-overlay does NOT dismiss the underlying overlays', async () => {
    const { router: ready, mocks } = setup([dashboard, transientConfirm]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm' });
    await router.navigate({ routeKey: 'confirm' });
    expect(router.getActiveView()?.overlays).toHaveLength(2);
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
  });

  it('surface navigation while an overlay is open auto-dismisses overlays', async () => {
    const sndTab: RouteDefinition = {
      key: 'reports',
      config: {},
      lifetime: RouteLifetime.singleton,
      defaultTitle: 'Raporlar',
    };
    const { router: ready, mocks } = setup([dashboard, sndTab, transientConfirm]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);

    await router.navigate({ routeKey: 'reports' });
    expect(router.getActiveView()?.overlays).toHaveLength(0);
    expect(mocks.disposeViewSurface).toHaveBeenCalledTimes(1);
    expect(router.getOpenTabs()).toHaveLength(2);
  });
});

describe('navigate() overlay — singleton fast-path', () => {
  it('preserve: re-navigate with same identity moves overlay to top, skips createViewSurface', async () => {
    const { router: ready, mocks } = setup([dashboard, singletonOverlayPreserve, transientConfirm]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    const r1 = await router.navigate({ routeKey: 'help' });
    const helpKey = r1.outcome === 'completed' ? r1.overlayKey : undefined;
    expect(helpKey).toBeTruthy();

    // Push a different overlay on top so the help overlay is not at top.
    await router.navigate({ routeKey: 'confirm' });
    let overlays = router.getActiveView()?.overlays ?? [];
    expect(overlays.find((o) => o.overlayKey === helpKey)?.stackIndex).toBe(0);

    const createCallsBefore = mocks.createViewSurface.mock.calls.length;

    const r2 = await router.navigate({ routeKey: 'help' });
    expect(r2.outcome).toBe('completed');
    if (r2.outcome === 'completed') {
      expect(r2.overlayKey).toBe(helpKey);
    }

    overlays = router.getActiveView()?.overlays ?? [];
    expect(overlays).toHaveLength(2);
    expect(overlays[overlays.length - 1]?.overlayKey).toBe(helpKey);
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(createCallsBefore);
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
    expect(mocks.onEvaluate).toHaveBeenCalledTimes(2 + 1); // tab + 2 overlays only (no third onEvaluate)
  });

  it('refresh: re-navigate disposes old overlay surface, recreates with same overlayKey', async () => {
    const { router: ready, mocks } = setup([dashboard, singletonOverlayRefresh]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    const r1 = await router.navigate({ routeKey: 'help-refresh' });
    const overlayKey = r1.outcome === 'completed' ? r1.overlayKey : undefined;
    expect(overlayKey).toBeTruthy();

    const oldOverlaySurface =
      router.getActiveView()?.overlays.find((o: OpenOverlay) => o.overlayKey === overlayKey)
        ?.surface;
    expect(oldOverlaySurface).toBeDefined();

    const r2 = await router.navigate({ routeKey: 'help-refresh' });
    if (r2.outcome === 'completed') {
      expect(r2.overlayKey).toBe(overlayKey);
    }

    expect(router.getActiveView()?.overlays).toHaveLength(1);
    expect(mocks.disposeViewSurface).toHaveBeenCalledWith(oldOverlaySurface);
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(3);
    const lastCall = mocks.createViewSurface.mock.calls.at(-1);
    expect(lastCall?.[0]?.handleKey).toBe(overlayKey);
    expect(lastCall?.[0]?.presentation).toBe('overlay');
  });

  it('different singletonKey field → opens a second overlay (separate identity)', async () => {
    const { router: ready, mocks } = setup([dashboard, singletonOverlayPerTopic]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    const r1 = await router.navigate({
      routeKey: 'topic',
      extraData: { topicId: 'a' },
    });
    const r2 = await router.navigate({
      routeKey: 'topic',
      extraData: { topicId: 'b' },
    });

    expect(router.getActiveView()?.overlays).toHaveLength(2);
    if (r1.outcome === 'completed' && r2.outcome === 'completed') {
      expect(r1.overlayKey).not.toBe(r2.overlayKey);
    }
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
  });

  it('same singletonKey field → fast-path activates same overlay regardless of position', async () => {
    const { router: ready, mocks } = setup([dashboard, singletonOverlayPerTopic]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    const r1 = await router.navigate({
      routeKey: 'topic',
      extraData: { topicId: 'a' },
    });
    const r2 = await router.navigate({
      routeKey: 'topic',
      extraData: { topicId: 'b' },
    });
    const r3 = await router.navigate({
      routeKey: 'topic',
      extraData: { topicId: 'a' },
    });
    if (r1.outcome === 'completed' && r3.outcome === 'completed') {
      expect(r3.overlayKey).toBe(r1.overlayKey);
    }
    if (r2.outcome === 'completed' && r3.outcome === 'completed') {
      expect(r3.overlayKey).not.toBe(r2.overlayKey);
    }

    const top = router.getActiveView()?.overlays.at(-1);
    if (r1.outcome === 'completed') {
      expect(top?.overlayKey).toBe(r1.overlayKey);
    }
    expect(router.getActiveView()?.overlays).toHaveLength(2);
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(3);
  });
});

describe('navigate() overlay — context shape', () => {
  it('NavigateContext carries presentation=overlay + overlayKey + tabKey of underlay', async () => {
    const { router: ready, mocks } = setup([dashboard, transientConfirm]);
    const router = await ready;

    const tabRes = await router.navigate({ routeKey: 'dashboard' });
    const expectedUnderlayTabKey =
      tabRes.outcome === 'completed' ? tabRes.tabKey : undefined;

    await router.navigate({ routeKey: 'confirm' });
    const overlayCall = mocks.onNavigate.mock.calls.find(
      ([ctx]) => ctx.presentation === 'overlay',
    );
    expect(overlayCall).toBeDefined();
    if (overlayCall) {
      const [ctx] = overlayCall;
      expect(ctx.presentation).toBe('overlay');
      expect(ctx.overlayKey).toBeTruthy();
      expect(ctx.tabKey).toBe(expectedUnderlayTabKey);
    }
  });
});
