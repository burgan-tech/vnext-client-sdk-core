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
  type PageRouterOptions,
  type RouteDefinition,
  type RouteRegistry,
} from '../src/index.js';

/**
 * Singleton fast-path / refresh-on-existing tests.
 *
 * These tests pin spec invariants from `page-router-interface.md` §"Fast-path"
 * and §"Singleton Identity":
 *
 * 1. routeKey-only matching (no `singletonKey`).
 * 2. routeKey + `singletonKey: ['accountNo']` matching.
 * 3. `restoreMode: 'preserve'` ⇒ no onEvaluate / no createViewSurface; same
 *    surface, same payload, history entry pushed.
 * 4. `restoreMode: 'refresh'` ⇒ disposeViewSurface(old) → createViewSurface
 *    with same handleKey, payload replaced, history entry pushed, no second
 *    tab opened.
 * 5. Different `accountNo` ⇒ second tab opens (no fast-path).
 * 6. `lifetime: 'transient'` + `singletonKey` ⇒ warn + always new tab.
 * 7. Missing `singletonKey` field on payload ⇒ transient fallback.
 * 8. Active overlay is dismissed when a surface tab activates.
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

const dashboardPreserve: RouteDefinition = {
  key: 'dashboard',
  config: {},
  lifetime: RouteLifetime.singleton,
  restoreMode: 'preserve',
  defaultTitle: 'Anasayfa',
};

const accountListRefresh: RouteDefinition = {
  key: 'account-list',
  config: {},
  lifetime: RouteLifetime.singleton,
  restoreMode: 'refresh',
  defaultTitle: 'Hesaplar',
};

const accountTxnsPreserve: RouteDefinition = {
  key: 'account-transactions',
  config: {},
  lifetime: RouteLifetime.singleton,
  singletonKey: ['accountNo'],
  restoreMode: 'preserve',
  inputs: [{ name: 'accountNo', required: true }],
  defaultTitle: { tr: 'Hareketler {{accountNo}}', en: 'Txns {{accountNo}}' },
};

const accountTxnsRefresh: RouteDefinition = {
  key: 'account-transactions',
  config: {},
  lifetime: RouteLifetime.singleton,
  singletonKey: ['accountNo'],
  restoreMode: 'refresh',
  inputs: [{ name: 'accountNo', required: true }],
  defaultTitle: { tr: 'Hareketler {{accountNo}}', en: 'Txns {{accountNo}}' },
};

const ephemeralBanner: RouteDefinition = {
  key: 'banner',
  config: {},
  lifetime: RouteLifetime.transient,
  // Spec says singletonKey on transient is ignored with a warn.
  singletonKey: ['kind'],
  inputs: [{ name: 'kind', required: false }],
  defaultTitle: 'Banner',
};

describe('navigate() singleton — routeKey-only identity', () => {
  it('preserve: re-navigate activates same tab, skips onEvaluate + createViewSurface', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;

    const r1 = await router.navigate({ routeKey: 'dashboard' });
    expect(r1.outcome).toBe('completed');
    expect(mocks.onEvaluate).toHaveBeenCalledOnce();
    expect(mocks.createViewSurface).toHaveBeenCalledOnce();

    const tabKey = r1.outcome === 'completed' ? r1.tabKey : undefined;
    expect(tabKey).toBeTruthy();

    const r2 = await router.navigate({ routeKey: 'dashboard' });
    expect(r2.outcome).toBe('completed');
    if (r2.outcome === 'completed') {
      expect(r2.tabKey).toBe(tabKey);
    }

    expect(router.getOpenTabs()).toHaveLength(1);
    expect(mocks.onEvaluate).toHaveBeenCalledOnce();
    expect(mocks.createViewSurface).toHaveBeenCalledOnce();
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
    expect(mocks.onNavigate).toHaveBeenCalledOnce();
  });

  it('preserve: history grows on revisit even though surface is reused', async () => {
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'dashboard' });
    expect(router.getHistory()).toHaveLength(2);
  });

  it('refresh: re-navigate disposes old surface, calls createViewSurface again, keeps tabKey', async () => {
    const { router: ready, mocks } = setup([accountListRefresh]);
    const router = await ready;

    const r1 = await router.navigate({ routeKey: 'account-list' });
    const tabKey = r1.outcome === 'completed' ? r1.tabKey : undefined;
    expect(tabKey).toBeTruthy();

    const oldSurface = router.getOpenTabs()[0]?.surface;
    expect(oldSurface).toBeDefined();

    const r2 = await router.navigate({ routeKey: 'account-list' });
    expect(r2.outcome).toBe('completed');
    if (r2.outcome === 'completed') {
      expect(r2.tabKey).toBe(tabKey);
    }

    expect(router.getOpenTabs()).toHaveLength(1);
    expect(mocks.onEvaluate).toHaveBeenCalledTimes(2);
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(2);
    expect(mocks.disposeViewSurface).toHaveBeenCalledTimes(1);
    expect(mocks.disposeViewSurface).toHaveBeenCalledWith(oldSurface);

    const newSurface = router.getOpenTabs()[0]?.surface;
    expect(newSurface).not.toBe(oldSurface);
  });

  it('refresh: createViewSurface receives the existing tabKey as handleKey', async () => {
    const { router: ready, mocks } = setup([accountListRefresh]);
    const router = await ready;

    const r1 = await router.navigate({ routeKey: 'account-list' });
    const tabKey = r1.outcome === 'completed' ? r1.tabKey : undefined;

    await router.navigate({ routeKey: 'account-list' });
    const handleKeys = mocks.createViewSurface.mock.calls.map(([arg]) => arg.handleKey);
    expect(handleKeys[0]).toBe(tabKey);
    expect(handleKeys[1]).toBe(tabKey);
  });
});

describe('navigate() singleton — routeKey + singletonKey identity', () => {
  it('same accountNo → preserve fast-path activates the same tab', async () => {
    const { router: ready, mocks } = setup([accountTxnsPreserve]);
    const router = await ready;

    const r1 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });
    const r2 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });

    expect(r1.outcome).toBe('completed');
    expect(r2.outcome).toBe('completed');
    if (r1.outcome === 'completed' && r2.outcome === 'completed') {
      expect(r1.tabKey).toBe(r2.tabKey);
    }
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(mocks.createViewSurface).toHaveBeenCalledOnce();
  });

  it('different accountNo → opens a second tab (separate identity)', async () => {
    const { router: ready, mocks } = setup([accountTxnsPreserve]);
    const router = await ready;

    const r1 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });
    const r2 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR2' },
    });

    expect(router.getOpenTabs()).toHaveLength(2);
    if (r1.outcome === 'completed' && r2.outcome === 'completed') {
      expect(r1.tabKey).not.toBe(r2.tabKey);
    }
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(2);
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
  });

  it('refresh on same accountNo → disposes + recreates with same tabKey, payload updated', async () => {
    const { router: ready, mocks } = setup([accountTxnsRefresh]);
    const router = await ready;

    const r1 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1', limit: 10 },
    });
    const tabKey = r1.outcome === 'completed' ? r1.tabKey : undefined;
    expect(tabKey).toBeTruthy();

    const r2 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1', limit: 50 },
    });
    if (r2.outcome === 'completed') {
      expect(r2.tabKey).toBe(tabKey);
      expect(r2.payload['limit']).toBe(50);
    }
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(mocks.disposeViewSurface).toHaveBeenCalledTimes(1);
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(2);
  });

  it('per-route mint counter: multiple distinct singleton identities never collide', async () => {
    // Reproduces the live-app bug where the global tab counter would skew
    // (HMR / reset) and `mintTabKey` could re-emit an existing key. Per-route
    // counters + defensive "skip-if-taken" loop must keep all minted keys
    // unique even when interleaved across routes and identities.
    const { router: ready } = setup([accountListRefresh, accountTxnsRefresh]);
    const router = await ready;

    const r1 = await router.navigate({ routeKey: 'account-list' });
    const r2 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });
    const r3 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR2' },
    });
    const r4 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR3' },
    });

    expect(router.getOpenTabs()).toHaveLength(4);
    const keys = [r1, r2, r3, r4].map((r) =>
      r.outcome === 'completed' ? r.tabKey : null,
    );
    expect(new Set(keys).size).toBe(4);
    expect(keys).toEqual([
      'account-list--1',
      'account-transactions--1',
      'account-transactions--2',
      'account-transactions--3',
    ]);
  });

  it('refresh re-navigate updates the active tab snapshot (item.title interpolated)', async () => {
    const { router: ready } = setup([accountTxnsRefresh]);
    const router = await ready;

    await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });

    // Drive the same identity but the title interpolation should reflect
    // the still-bound payload (not a stale snapshot).
    const r2 = await router.navigate({
      routeKey: 'account-transactions',
      extraData: { accountNo: 'TR1' },
    });
    if (r2.outcome === 'completed') {
      expect(r2.resolvedItems[0]?.title).toBe('Hareketler TR1');
    }
  });
});

describe('navigate() singleton — fallbacks', () => {
  it('transient + singletonKey ⇒ warn singleton-key-ignored-on-transient + always new tab', async () => {
    const { router: ready, mocks } = setup([ephemeralBanner]);
    const router = await ready;

    await router.navigate({ routeKey: 'banner', extraData: { kind: 'info' } });
    await router.navigate({ routeKey: 'banner', extraData: { kind: 'info' } });

    expect(router.getOpenTabs()).toHaveLength(2);
    const reasons = mocks.onLog.mock.calls
      .filter((c) => c[0] === 'warn')
      .map((c) => c[1]);
    expect(reasons).toContain('singleton-key-ignored-on-transient');
  });

  it('singletonKey field missing in payload ⇒ transient fallback + warn singleton-key-missing-value', async () => {
    const route: RouteDefinition = {
      key: 'compare',
      config: {},
      lifetime: RouteLifetime.singleton,
      singletonKey: ['a', 'b'],
      inputs: [
        { name: 'a', required: false },
        { name: 'b', required: false },
      ],
      defaultTitle: 'Compare',
    };
    const { router: ready, mocks } = setup([route]);
    const router = await ready;

    await router.navigate({ routeKey: 'compare', extraData: { a: 'x' } });
    await router.navigate({ routeKey: 'compare', extraData: { a: 'x' } });

    // Two transient tabs opened because `b` is missing/undefined → fallback.
    expect(router.getOpenTabs()).toHaveLength(2);
    const reasons = mocks.onLog.mock.calls
      .filter((c) => c[0] === 'warn')
      .map((c) => c[1]);
    expect(reasons).toContain('singleton-key-missing-value');
  });
});

describe('navigate() singleton — overlay auto-dismiss on focus shift', () => {
  it('refresh activation on existing tab dismisses any open overlay (focus shift)', async () => {
    const overlayRoute: RouteDefinition = {
      key: 'confirm',
      config: {},
      lifetime: RouteLifetime.transient,
      presentation: 'overlay',
      defaultTitle: 'Onay',
    };

    const { router: ready, mocks } = setup([accountListRefresh, overlayRoute]);
    const router = await ready;

    await router.navigate({ routeKey: 'account-list' });
    await router.navigate({ routeKey: 'confirm' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);

    await router.navigate({ routeKey: 'account-list' });
    expect(router.getActiveView()?.overlays).toHaveLength(0);
    expect(mocks.disposeViewSurface).toHaveBeenCalled();
  });

  it('preserve fast-path activation also dismisses overlays', async () => {
    const overlayRoute: RouteDefinition = {
      key: 'confirm',
      config: {},
      lifetime: RouteLifetime.transient,
      presentation: 'overlay',
      defaultTitle: 'Onay',
    };

    const { router: ready, mocks } = setup([dashboardPreserve, overlayRoute]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);

    // Snapshot calls before the fast-path navigation so we can assert
    // that the fast-path itself doesn't add new createViewSurface calls.
    const createCallsBeforeFastPath = mocks.createViewSurface.mock.calls.length;
    await router.navigate({ routeKey: 'dashboard' });
    expect(router.getActiveView()?.overlays).toHaveLength(0);
    // One dispose for the overlay; the underlying tab surface stays alive.
    expect(mocks.disposeViewSurface).toHaveBeenCalledTimes(1);
    // Fast-path adds NO createViewSurface calls.
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(createCallsBeforeFastPath);
  });
});
