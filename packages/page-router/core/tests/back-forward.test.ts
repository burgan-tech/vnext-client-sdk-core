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
  restoreMode: 'preserve',
  defaultTitle: 'Anasayfa',
};

const accountList: RouteDefinition = {
  key: 'account-list',
  config: {},
  lifetime: RouteLifetime.singleton,
  restoreMode: 'preserve',
  defaultTitle: 'Hesaplar',
};

const accountDetail: RouteDefinition = {
  key: 'account-detail',
  config: {},
  inputs: [{ name: 'accountNo', required: true }],
  singletonKey: ['accountNo'],
  lifetime: RouteLifetime.singleton,
  restoreMode: 'preserve',
  defaultTitle: 'Detay',
};

const overlayHelp: RouteDefinition = {
  key: 'help',
  config: {},
  presentation: 'overlay',
  lifetime: RouteLifetime.transient,
  defaultTitle: 'Yardım',
};

describe('PageRouter — goBack boundary', () => {
  it('cancelled + history-bound when history is empty', async () => {
    const { router: ready, mocks } = setup([dashboard]);
    const router = await ready;
    const result = await router.goBack();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('history-bound');
    }
    const debugs = mocks.onLog.mock.calls.filter((c) => c[0] === 'debug').map((c) => c[1]);
    expect(debugs).toContain('history-bound');
  });

  it('cancelled + history-bound at the bottom of the stack (single entry)', async () => {
    const { router: ready } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    expect(router.canGoBack()).toBe(false);
    const result = await router.goBack();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('history-bound');
    }
  });
});

describe('PageRouter — goBack across MDI singleton tabs', () => {
  it('moves cursor + activates the previous tab without pushing a new history entry', async () => {
    const { router: ready, mocks } = setup([dashboard, accountList]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    expect(router.getActiveTab()?.item.key).toBe('account-list');
    const historyLenBefore = router.getHistory().length;
    const createsBefore = mocks.createViewSurface.mock.calls.length;

    const result = await router.goBack();
    expect(result.outcome).toBe('completed');
    expect(router.getActiveTab()?.item.key).toBe('dashboard');
    // preserve restoreMode + singleton match → fast-path, no new surface.
    expect(mocks.createViewSurface.mock.calls.length).toBe(createsBefore);
    // History length unchanged (cursor moved, no push).
    expect(router.getHistory().length).toBe(historyLenBefore);
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(true);
  });

  it('emits onHistoryChanged when cursor moves', async () => {
    const { router: ready } = setup([dashboard, accountList]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });

    const onHistory = vi.fn();
    router.onHistoryChanged(onHistory);
    await router.goBack();
    expect(onHistory).toHaveBeenCalled();
  });

  it('preserves the entry payload across goBack (e.g. accountNo)', async () => {
    const { router: ready } = setup([dashboard, accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({
      routeKey: 'account-detail',
      extraData: { accountNo: 'TR-1' },
    });
    await router.navigate({
      routeKey: 'account-detail',
      extraData: { accountNo: 'TR-2' },
    });
    expect(router.getOpenTabs()).toHaveLength(3);
    expect(router.getActiveTab()?.payload['accountNo']).toBe('TR-2');

    await router.goBack();
    expect(router.getActiveTab()?.payload['accountNo']).toBe('TR-1');
    await router.goBack();
    expect(router.getActiveTab()?.item.key).toBe('dashboard');
  });
});

describe('PageRouter — goBack with open overlay', () => {
  it('top-dismisses the overlay instead of moving the history cursor', async () => {
    const { router: ready, mocks } = setup([dashboard, overlayHelp]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);
    const historyBefore = router.getHistory();
    const overlayClosed = vi.fn();
    router.onOverlayClosed(overlayClosed);

    const result = await router.goBack();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('overlay-dismissed-instead');
    }
    expect(router.getActiveView()?.overlays).toHaveLength(0);
    expect(overlayClosed).toHaveBeenCalledOnce();
    // History pointer untouched.
    expect(router.getHistory().length).toBe(historyBefore.length);
    expect(mocks.disposeViewSurface).toHaveBeenCalled();

    const infos = mocks.onLog.mock.calls.filter((c) => c[0] === 'info').map((c) => c[1]);
    expect(infos).toContain('overlay-dismissed-instead');
  });

  it('with multiple overlays only dismisses the top one (subsequent goBack pops the next)', async () => {
    const dialog: RouteDefinition = {
      key: 'dialog',
      config: {},
      presentation: 'overlay',
      lifetime: RouteLifetime.transient,
      defaultTitle: 'Diyalog',
    };
    const { router: ready } = setup([dashboard, overlayHelp, dialog]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    await router.navigate({ routeKey: 'dialog' });
    expect(router.getActiveView()?.overlays).toHaveLength(2);

    await router.goBack();
    expect(router.getActiveView()?.overlays).toHaveLength(1);
    await router.goBack();
    expect(router.getActiveView()?.overlays).toHaveLength(0);
    // Now the next goBack actually moves the history cursor.
    expect(router.canGoBack()).toBe(false);
  });
});

describe('PageRouter — goForward', () => {
  it('cancelled + history-bound at the forward boundary', async () => {
    const { router: ready, mocks } = setup([dashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    const result = await router.goForward();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('history-bound');
    }
    const debugs = mocks.onLog.mock.calls.filter((c) => c[0] === 'debug').map((c) => c[1]);
    expect(debugs).toContain('history-bound');
  });

  it('moves cursor forward after a goBack and re-activates that entry', async () => {
    const { router: ready, mocks } = setup([dashboard, accountList]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    await router.goBack();
    const createsBefore = mocks.createViewSurface.mock.calls.length;

    const result = await router.goForward();
    expect(result.outcome).toBe('completed');
    expect(router.getActiveTab()?.item.key).toBe('account-list');
    expect(mocks.createViewSurface.mock.calls.length).toBe(createsBefore);
    expect(router.canGoForward()).toBe(false);
  });

  it('a fresh navigate after goBack drops the forward tail (canGoForward=false)', async () => {
    const { router: ready } = setup([dashboard, accountList, accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'account-list' });
    await router.goBack();
    expect(router.canGoForward()).toBe(true);

    await router.navigate({
      routeKey: 'account-detail',
      extraData: { accountNo: 'TR-9' },
    });
    expect(router.canGoForward()).toBe(false);
  });

  it('does NOT have a special overlay-aware pre-check (overlays do not enter history)', async () => {
    // Spec: "goForward(): Overlay stack ile etkileşimi yok (overlay'ler
    // history'de olmadığı için 'forward'a overlay gelmez)." — i.e. goForward
    // never reports `overlay-dismissed-instead`. At a boundary it still
    // returns `history-bound` even with overlays open; the overlay stack is
    // NOT touched by goForward itself.
    const { router: ready } = setup([dashboard, overlayHelp]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);
    expect(router.canGoForward()).toBe(false);

    const result = await router.goForward();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('history-bound');
    }
    // goForward itself did not dismiss the overlay (no surface activation
    // happened either, since the call short-circuited at the boundary).
    expect(router.getActiveView()?.overlays).toHaveLength(1);
  });
});
