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

interface Mocks {
  onEvaluate: ReturnType<typeof vi.fn<OnEvaluate>>;
  onNavigate: ReturnType<typeof vi.fn<OnNavigate>>;
  createViewSurface: ReturnType<typeof vi.fn<CreateViewSurface>>;
  disposeViewSurface: ReturnType<typeof vi.fn<DisposeViewSurface>>;
  onLog: ReturnType<typeof vi.fn<OnLog>>;
}

function setup(
  routes: RouteDefinition[],
  extra: Partial<PageRouterOptions> = {},
): { router: Promise<IPageRouter>; mocks: Mocks } {
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
  defaultTitle: 'Dashboard',
};

const accountList: RouteDefinition = {
  key: 'account-list',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: 'Hesaplar',
};

const accountDetail: RouteDefinition = {
  key: 'account-detail',
  config: {},
  lifetime: RouteLifetime.transient,
  defaultTitle: 'Detay',
};

const overlayRoute: RouteDefinition = {
  key: 'help',
  config: {},
  presentation: 'overlay',
  lifetime: RouteLifetime.transient,
  defaultTitle: 'Yardım',
};

describe('PageRouter — setShellMode no-op + signal', () => {
  it('same-mode call still re-emits onShellModeChanged for self-heal but skips sweep + dispose', async () => {
    // No state change → no tab sweep, no dispose. We *do* re-emit the
    // current mode so external mirrors (Vue refs that drifted under HMR,
    // late-mounted host shells) can re-sync.
    const { router: ready, mocks } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    const onShell = vi.fn();
    router.onShellModeChanged(onShell);
    const onClosed = vi.fn();
    router.onTabClosed(onClosed);

    const result = await router.setShellMode(ShellMode.mdi);
    expect(result.outcome).toBe('completed');
    expect(onShell).toHaveBeenCalledTimes(1);
    expect(onShell.mock.calls[0]?.[0]).toBe(ShellMode.mdi);
    expect(onClosed).not.toHaveBeenCalled();
    expect(mocks.disposeViewSurface).not.toHaveBeenCalled();
  });

  it('different-mode call emits onShellModeChanged with the new mode', async () => {
    const { router: ready } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });

    const onShell = vi.fn();
    router.onShellModeChanged(onShell);
    await router.setShellMode(ShellMode.sdi);
    expect(onShell).toHaveBeenCalledOnce();
    expect(onShell.mock.calls[0]?.[0]).toBe(ShellMode.sdi);
    expect(router.getShellMode()).toBe(ShellMode.sdi);
  });
});

describe('PageRouter — MDI → SDI sweep', () => {
  it('preserves the active tab and closes the rest with disposeViewSurface', async () => {
    const { router: ready, mocks } = setup([dashboard, accountList, accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: '1' } });
    expect(router.getOpenTabs()).toHaveLength(3);
    const activeKey = router.getActiveTab()?.tabKey;
    const disposeBefore = mocks.disposeViewSurface.mock.calls.length;

    const closed: string[] = [];
    router.onTabClosed((k) => closed.push(k));

    await router.setShellMode(ShellMode.sdi);

    const tabs = router.getOpenTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.tabKey).toBe(activeKey);
    expect(closed).toHaveLength(2);
    expect(closed).not.toContain(activeKey);
    expect(mocks.disposeViewSurface.mock.calls.length).toBe(disposeBefore + 2);
  });

  it('marks swept tabs as closed in history (entries kept, not deleted)', async () => {
    const { router: ready } = setup([dashboard, accountList]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    const beforeLen = router.getHistory().length;

    await router.setShellMode(ShellMode.sdi);

    const after = router.getHistory();
    expect(after.length).toBe(beforeLen);
    // The non-active history entry must be flagged closed.
    const closedCount = after.filter((e) => e.closed).length;
    expect(closedCount).toBeGreaterThanOrEqual(1);
  });

  it('dismisses every open overlay before swapping mode', async () => {
    const { router: ready, mocks } = setup([dashboard, overlayRoute]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);
    const disposeBefore = mocks.disposeViewSurface.mock.calls.length;

    const overlayClosed = vi.fn();
    router.onOverlayClosed(overlayClosed);

    await router.setShellMode(ShellMode.sdi);

    expect(router.getActiveView()?.overlays ?? []).toHaveLength(0);
    expect(overlayClosed).toHaveBeenCalledOnce();
    expect(mocks.disposeViewSurface.mock.calls.length).toBeGreaterThanOrEqual(
      disposeBefore + 1,
    );
  });
});

describe('PageRouter — SDI → MDI', () => {
  it('emits onShellModeChanged and keeps a single active tab', async () => {
    const { router: ready } = setup([dashboard], { shellMode: ShellMode.sdi });
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    expect(router.getShellMode()).toBe(ShellMode.sdi);

    const onShell = vi.fn();
    router.onShellModeChanged(onShell);
    await router.setShellMode(ShellMode.mdi);

    expect(onShell).toHaveBeenCalledWith(ShellMode.mdi);
    expect(router.getShellMode()).toBe(ShellMode.mdi);
    expect(router.getOpenTabs()).toHaveLength(1);
  });

  it('dismisses active overlays during the swap', async () => {
    const { router: ready } = setup([dashboard, overlayRoute], {
      shellMode: ShellMode.sdi,
    });
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);

    await router.setShellMode(ShellMode.mdi);
    expect(router.getActiveView()?.overlays ?? []).toHaveLength(0);
  });
});

describe('PageRouter — shell-mode sweep + homepage interaction', () => {
  it('preserves homepage state when its tab is active during MDI → SDI', async () => {
    const { router: ready } = setup([dashboard]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const homepageTabKey = router.getOpenTabs()[0]?.tabKey;
    expect(router.getActiveTab()?.tabKey).toBe(homepageTabKey);

    const onHomepageChanged = vi.fn();
    router.onHomepageChanged(onHomepageChanged);

    await router.setShellMode(ShellMode.sdi);

    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.tabKey).toBe(homepageTabKey);
    // Spec: "onHomepageChanged fire edilmez — state korunur (stale)."
    expect(onHomepageChanged).not.toHaveBeenCalled();
  });

  it('preserves homepage state but closes its tab when homepage is NOT the active tab', async () => {
    const { router: ready, mocks } = setup([dashboard, accountList]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const homepageTabKey = router.getOpenTabs()[0]?.tabKey;
    await router.navigate({ routeKey: 'account-list' });
    // Now account-list is active, dashboard (homepage) is in background.
    expect(router.getActiveTab()?.item.key).toBe('account-list');

    const onHomepageChanged = vi.fn();
    router.onHomepageChanged(onHomepageChanged);
    const closed: string[] = [];
    router.onTabClosed((k) => closed.push(k));

    await router.setShellMode(ShellMode.sdi);

    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(closed).toContain(homepageTabKey);
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.item.key).toBe('account-list');
    expect(onHomepageChanged).not.toHaveBeenCalled();
    // Homepage tab was force-closed even though it was locked → dispose ran.
    expect(mocks.disposeViewSurface).toHaveBeenCalled();
  });
});

describe('PageRouter — SDI → MDI auto-restores configured homepage', () => {
  // Spec invariant: in MDI mode, a configured homepage is always represented
  // as a pinned, locked tab. The MDI → SDI sweep can drop the homepage tab
  // (when it was inactive at the moment of the flip), so the SDI → MDI
  // direction must re-materialise it from the surviving config. This is the
  // SDK guarantee that lets hosts implement a Shell-toggle button without
  // manually re-asserting `setHomepage` after every flip.
  it('re-binds the active tab as homepage when it already matches the homepage identity', async () => {
    const { router: ready, mocks } = setup([dashboard, accountList]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    const homepageTabKey = router.getOpenTabs()[0]?.tabKey;
    // Flip to SDI with dashboard as the active tab → homepage tab survives
    // the sweep, and on flip-back it must remain the same tab (idempotent
    // re-bind, no new createViewSurface).
    await router.setShellMode(ShellMode.sdi);
    const createBefore = mocks.createViewSurface.mock.calls.length;

    await router.setShellMode(ShellMode.mdi);

    const tabs = router.getOpenTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.tabKey).toBe(homepageTabKey);
    expect(tabs[0]?.isPinned).toBe(true);
    expect(tabs[0]?.isClosable).toBe(false);
    // Re-bind only — no new surface allocation since the singleton match
    // hits the surviving dashboard tab.
    expect(mocks.createViewSurface.mock.calls.length).toBe(createBefore);
  });

  it('opens + pins the homepage tab when the active SDI view is something else', async () => {
    const { router: ready } = setup([dashboard, accountList]);
    const router = await ready;
    await router.setHomepage({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    // MDI → SDI: account-list is active, so dashboard (homepage) is dropped
    // by the sweep but its config persists.
    await router.setShellMode(ShellMode.sdi);
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.item.key).toBe('account-list');

    // SDI → MDI: SDK must reopen + pin the homepage tab. account-list stays
    // open as a sibling tab; the homepage becomes the active focus (mirrors
    // the post-login UX where homepage is what the user sees first in MDI).
    await router.setShellMode(ShellMode.mdi);

    const tabs = router.getOpenTabs();
    expect(tabs).toHaveLength(2);
    // Homepage tab is parked at index 0 — leftmost-slot convention. Even
    // though it was created *after* account-list, the bind path moves it.
    expect(tabs[0]?.item.key).toBe('dashboard');
    expect(tabs[0]?.isPinned).toBe(true);
    expect(tabs[0]?.isClosable).toBe(false);
    expect(router.getActiveTab()?.tabKey).toBe(tabs[0]?.tabKey);
    // Sibling SDI view is still around so the user doesn't lose context.
    expect(tabs[1]?.item.key).toBe('account-list');
  });

  it('is a no-op when no homepage is configured (login boot, post-logout flip)', async () => {
    // Mirrors the LogoutConfirmView flow: setHomepage(null) → setShellMode(sdi).
    // A subsequent flip back to MDI must not magically resurrect a homepage
    // that the host explicitly cleared. This is what keeps the existing
    // login bootstrap (which sets homepage *after* shell mode) intact.
    const { router: ready, mocks } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.setShellMode(ShellMode.sdi);
    const createBefore = mocks.createViewSurface.mock.calls.length;

    await router.setShellMode(ShellMode.mdi);

    expect(router.getHomepage()).toBeNull();
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.isPinned).toBe(false);
    expect(mocks.createViewSurface.mock.calls.length).toBe(createBefore);
  });
});

describe('PageRouter — post-swap navigate uses the new shell mode', () => {
  it('after MDI → SDI, singleton identity matching no longer fires (lifetime falls back to transient surface flow)', async () => {
    const { router: ready, mocks } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });

    await router.setShellMode(ShellMode.sdi);
    const createCallsBefore = mocks.createViewSurface.mock.calls.length;

    // In SDI, the navigate pipeline does not consult open-tab singleton match
    // (presentation === 'surface' && shellMode === mdi gate). So a new
    // createViewSurface call must occur.
    await router.navigate({ routeKey: 'dashboard' });
    expect(mocks.createViewSurface.mock.calls.length).toBe(createCallsBefore + 1);
  });
});
