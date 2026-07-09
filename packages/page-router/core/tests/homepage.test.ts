import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type CreateViewSurface,
  type DisposeViewSurface,
  type HomepageConfig,
  type IPageRouter,
  type OnEvaluate,
  type OnLog,
  type OnNavigate,
  type PageRouterOptions,
  type RouteDefinition,
  type RouteRegistry,
} from '../src/index.js';

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

const authRoute: RouteDefinition = {
  key: 'authentication',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: 'Giriş',
};

describe('PageRouter — homepage initial state', () => {
  it('getHomepage() is null before setHomepage is called', async () => {
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;
    expect(router.getHomepage()).toBeNull();
  });
});

describe('PageRouter — setHomepage default navigate', () => {
  it('opens the homepage tab, locks it (pinned + non-closable), emits onHomepageChanged', async () => {
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;
    const onChanged = vi.fn<(c: HomepageConfig | null) => void>();
    router.onHomepageChanged(onChanged);

    const result = await router.setHomepage({ routeKey: 'dashboard' });
    expect(result.outcome).toBe('completed');

    const tabs = router.getOpenTabs();
    expect(tabs).toHaveLength(1);
    const tab = tabs[0]!;
    expect(tab.isPinned).toBe(true);
    expect(tab.isClosable).toBe(false);

    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onChanged.mock.calls[0]?.[0]).toEqual({ routeKey: 'dashboard' });
  });

  it('same identity again does NOT fire onHomepageChanged but still activates / runs restoreMode', async () => {
    const { router: ready, mocks } = setup([accountListRefresh]);
    const router = await ready;
    const onChanged = vi.fn();
    router.onHomepageChanged(onChanged);

    await router.setHomepage({ routeKey: 'account-list' });
    expect(onChanged).toHaveBeenCalledOnce();
    const createCallsAfterFirst = mocks.createViewSurface.mock.calls.length;
    const disposeCallsAfterFirst = mocks.disposeViewSurface.mock.calls.length;

    await router.setHomepage({ routeKey: 'account-list' });
    expect(onChanged).toHaveBeenCalledOnce();
    // refresh restoreMode → dispose old + create new on the same tabKey.
    expect(mocks.disposeViewSurface.mock.calls.length).toBeGreaterThan(disposeCallsAfterFirst);
    expect(mocks.createViewSurface.mock.calls.length).toBeGreaterThan(createCallsAfterFirst);
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);
  });

  it('different identity swaps homepage: old tab closes, new tab opens + locks, onHomepageChanged fires', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve, authRoute]);
    const router = await ready;
    const onChanged = vi.fn<(c: HomepageConfig | null) => void>();
    router.onHomepageChanged(onChanged);

    await router.setHomepage({ routeKey: 'authentication' });
    const oldKey = router.getOpenTabs()[0]?.tabKey;
    expect(router.getOpenTabs()).toHaveLength(1);

    await router.setHomepage({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()).toHaveLength(1);
    const newKey = router.getOpenTabs()[0]?.tabKey;
    expect(newKey).not.toBe(oldKey);
    expect(router.getOpenTabs()[0]?.item.key).toBe('dashboard');
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);

    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(onChanged.mock.calls[1]?.[0]).toEqual({ routeKey: 'dashboard' });
    expect(mocks.disposeViewSurface).toHaveBeenCalled();

    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
  });

  it('returns cancelled + route-not-found when the new homepage route is not in the registry', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;

    await router.setHomepage({ routeKey: 'dashboard' });
    const onChangedAfter = vi.fn();
    router.onHomepageChanged(onChangedAfter);

    const result = await router.setHomepage({ routeKey: 'does-not-exist' });
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('route-not-found');
    }
    // Old homepage state preserved.
    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(onChangedAfter).not.toHaveBeenCalled();
    const reasons = mocks.onLog.mock.calls.filter((c) => c[0] === 'warn').map((c) => c[1]);
    expect(reasons).toContain('route-not-found');
  });
});

describe('PageRouter — setHomepage(null)', () => {
  it('unlocks the homepage tab without closing it, emits onHomepageChanged(null)', async () => {
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;
    const onChanged = vi.fn();
    router.onHomepageChanged(onChanged);

    await router.setHomepage({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);

    await router.setHomepage(null);
    expect(router.getHomepage()).toBeNull();
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.isPinned).toBe(false);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(onChanged.mock.calls[1]?.[0]).toBeNull();
  });

  it('setHomepage(null) when no homepage is set still re-emits null for self-heal', async () => {
    // State is unchanged but we re-emit so external observers (e.g. Vue
    // refs that drifted under HMR) can re-pull the canonical value.
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;
    const onChanged = vi.fn();
    router.onHomepageChanged(onChanged);
    const result = await router.setHomepage(null);
    expect(result.outcome).toBe('completed');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged.mock.calls[0]?.[0]).toBeNull();
  });
});

describe('PageRouter — setHomepage({ navigate: false })', () => {
  it('updates state and adopts a matching open tab as the homepage tab', async () => {
    const { router: ready } = setup([dashboardPreserve]);
    const router = await ready;

    await router.navigate({ routeKey: 'dashboard' });
    const tabKey = router.getOpenTabs()[0]?.tabKey;
    expect(router.getOpenTabs()[0]?.isPinned).toBe(false);

    const onChanged = vi.fn();
    router.onHomepageChanged(onChanged);

    const result = await router.setHomepage(
      { routeKey: 'dashboard' },
      { navigate: false },
    );
    expect(result.outcome).toBe('completed');

    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.tabKey).toBe(tabKey);
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
  });

  it('navigate: false without an existing matching tab leaves state set + tab not opened', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;

    await router.setHomepage({ routeKey: 'dashboard' }, { navigate: false });
    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()).toHaveLength(0);
    expect(mocks.createViewSurface).not.toHaveBeenCalled();
  });
});

describe('PageRouter — goHome', () => {
  it('navigates to the current homepage and respects route restoreMode', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const callsAfterSetup = mocks.createViewSurface.mock.calls.length;

    const result = await router.goHome();
    expect(result.outcome).toBe('completed');
    if (result.outcome === 'completed') {
      expect(result.tabKey).toBe(router.getOpenTabs()[0]?.tabKey);
    }
    // preserve restoreMode → fast-path, no extra createViewSurface.
    expect(mocks.createViewSurface).toHaveBeenCalledTimes(callsAfterSetup);
  });

  it('returns failed when no homepage is set + warns no-homepage-set', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;
    const result = await router.goHome();
    expect(result.outcome).toBe('failed');
    const reasons = mocks.onLog.mock.calls.filter((c) => c[0] === 'warn').map((c) => c[1]);
    expect(reasons).toContain('no-homepage-set');
  });

  it('keeps the homepage lock after goHome (idempotent re-bind)', async () => {
    const { router: ready } = setup([accountListRefresh]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'account-list' });

    await router.goHome();
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);
  });
});

describe('PageRouter — homepage tab lock semantics', () => {
  it('closeTab(homepageKey) is a no-op + warn homepage-not-closable', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const tabKey = router.getOpenTabs()[0]?.tabKey;

    await router.closeTab(tabKey!);
    expect(router.getOpenTabs()).toHaveLength(1);
    const reasons = mocks.onLog.mock.calls.filter((c) => c[0] === 'warn').map((c) => c[1]);
    expect(reasons).toContain('homepage-not-closable');
  });

  it('pinTab/unpinTab on homepage tab no-ops + info homepage-pin-locked', async () => {
    const { router: ready, mocks } = setup([dashboardPreserve]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const tabKey = router.getOpenTabs()[0]?.tabKey;

    router.pinTab(tabKey!);
    router.unpinTab(tabKey!);

    // Tab still pinned + non-closable.
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);

    const infos = mocks.onLog.mock.calls.filter((c) => c[0] === 'info').map((c) => c[1]);
    expect(infos.filter((m) => m === 'homepage-pin-locked').length).toBeGreaterThanOrEqual(2);
  });
});
