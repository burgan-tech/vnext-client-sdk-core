import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type CreateViewSurface,
  type IPageRouter,
  type NavigateContext,
  type NavigationItem,
  type OnEvaluate,
  type OnLog,
  type OnNavigate,
  type PageRouterOptions,
  type RouteDefinition,
  type RouteRegistry,
  type ViewSurface,
} from '../src/index.js';

interface Mocks {
  onEvaluate: ReturnType<typeof vi.fn<OnEvaluate>>;
  onNavigate: ReturnType<typeof vi.fn<OnNavigate>>;
  createViewSurface: ReturnType<typeof vi.fn<CreateViewSurface>>;
  disposeViewSurface: ReturnType<typeof vi.fn<(s: ViewSurface) => void | Promise<void>>>;
  onLog: ReturnType<typeof vi.fn<OnLog>>;
}

function setup(routes: RouteDefinition[], extra: Partial<PageRouterOptions> = {}): {
  router: Promise<IPageRouter>;
  mocks: Mocks;
} {
  const onEvaluate: Mocks['onEvaluate'] = vi.fn(async ({ item }) => [item]);
  const onNavigate: Mocks['onNavigate'] = vi.fn(async () => undefined);
  const createViewSurface: Mocks['createViewSurface'] = vi.fn(
    async ({ handleKey, item }) => ({ handleKey, mount: { handleKey, key: item.key } }),
  );
  const disposeViewSurface = vi.fn();
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

const accountDetail: RouteDefinition = {
  key: 'account-detail',
  config: { resource: 'urn:amorphie:res:view:account-detail' },
  lifetime: RouteLifetime.singleton,
  inputs: [{ name: 'accountNo', required: true }],
  defaultTitle: { tr: 'Hesap {{accountNo}}', en: 'Account {{accountNo}}' },
};

const accountList: RouteDefinition = {
  key: 'account-list',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: 'Hesaplar',
};

describe('navigate() — happy path (MDI surface)', () => {
  it('opens a new tab, activates it, and writes a history entry', async () => {
    const { router: ready, mocks } = setup([accountList]);
    const router = await ready;

    const result = await router.navigate({ routeKey: 'account-list' });

    expect(result.outcome).toBe('completed');
    if (result.outcome === 'completed') {
      expect(result.presentation).toBe('surface');
      expect(result.tabKey).toBeTruthy();
      expect(result.resolvedItems[0]?.key).toBe('account-list');
      expect(result.resolvedItems[0]?.title).toBe('Hesaplar');
    }

    const tabs = router.getOpenTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.item.key).toBe('account-list');
    expect(router.getActiveTab()?.tabKey).toBe(tabs[0]?.tabKey);

    expect(router.getHistory()).toHaveLength(1);
    const entry = router.getHistory()[0]!;
    expect(entry.shellMode).toBe(ShellMode.mdi);
    expect(entry.tabKey).toBe(tabs[0]?.tabKey);

    expect(mocks.onEvaluate).toHaveBeenCalledOnce();
    expect(mocks.createViewSurface).toHaveBeenCalledWith(
      expect.objectContaining({ presentation: 'surface' }),
    );
    expect(mocks.onNavigate).toHaveBeenCalledOnce();
    const [ctx, surface] = mocks.onNavigate.mock.calls[0]!;
    expect(ctx.source).toBe('routeKey');
    expect(ctx.shellMode).toBe(ShellMode.mdi);
    expect(ctx.lifetime).toBe(RouteLifetime.singleton);
    expect(ctx.presentation).toBe('surface');
    expect(ctx.restoreMode).toBe('refresh');
    expect(ctx.resolvedItems[0]?.key).toBe('account-list');
    expect(ctx.tabKey).toBe(tabs[0]?.tabKey);
    expect(surface.handleKey).toBe(tabs[0]?.tabKey);
  });

  it('emits onTabOpened, onTabActivated, onHistoryChanged, afterNavigate', async () => {
    const { router: ready } = setup([accountList]);
    const router = await ready;

    const tabOpened = vi.fn();
    const tabActivated = vi.fn();
    const historyChanged = vi.fn();
    const afterNavigate = vi.fn<(payload: { outcome: string }) => Promise<void>>(
      async () => undefined,
    );
    router.onTabOpened(tabOpened);
    router.onTabActivated(tabActivated);
    router.onHistoryChanged(historyChanged);
    router.onAfterNavigate(afterNavigate);

    await router.navigate({ routeKey: 'account-list' });

    expect(tabOpened).toHaveBeenCalledOnce();
    expect(tabActivated).toHaveBeenCalledOnce();
    expect(historyChanged).toHaveBeenCalledOnce();
    expect(afterNavigate).toHaveBeenCalledOnce();
    const afterArg = afterNavigate.mock.calls[0]![0];
    expect(afterArg.outcome).toBe('completed');
  });

  it('resolves payload from extraData and surfaces interpolated title', async () => {
    const { router: ready } = setup([accountDetail]);
    const router = await ready;

    const result = await router.navigate({
      routeKey: 'account-detail',
      extraData: { accountNo: 'TR123' },
    });

    expect(result.outcome).toBe('completed');
    if (result.outcome === 'completed') {
      expect(result.resolvedItems[0]?.title).toBe('Hesap TR123');
      expect(result.payload).toEqual({ accountNo: 'TR123' });
    }
  });
});

describe('navigate() — early cancellations', () => {
  it('returns cancelled with reason "route-not-found" when registry has no entry', async () => {
    const { router: ready, mocks } = setup([accountList]);
    const router = await ready;

    const r = await router.navigate({ routeKey: 'nope' });
    expect(r.outcome).toBe('cancelled');
    if (r.outcome === 'cancelled') expect(r.reason).toBe('route-not-found');

    expect(mocks.onEvaluate).not.toHaveBeenCalled();
    expect(mocks.createViewSurface).not.toHaveBeenCalled();
    expect(mocks.onNavigate).not.toHaveBeenCalled();
    expect(router.getOpenTabs()).toEqual([]);
    expect(mocks.onLog).toHaveBeenCalledWith(
      'warn',
      'route-not-found',
      undefined,
      expect.any(Object),
    );
  });

  it('returns cancelled with reason "missing-required-input" when required field is absent', async () => {
    const { router: ready, mocks } = setup([accountDetail]);
    const router = await ready;

    const r = await router.navigate({ routeKey: 'account-detail' });
    expect(r.outcome).toBe('cancelled');
    if (r.outcome === 'cancelled') expect(r.reason).toBe('missing-required-input');
    expect(mocks.onEvaluate).not.toHaveBeenCalled();
    expect(mocks.createViewSurface).not.toHaveBeenCalled();
    expect(router.getOpenTabs()).toEqual([]);
  });

  it('returns cancelled with reason "empty-evaluation" when onEvaluate yields empty array', async () => {
    const { router: ready, mocks } = setup([accountList], {
      onEvaluate: vi.fn(async () => []),
    });
    const router = await ready;
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('cancelled');
    if (r.outcome === 'cancelled') expect(r.reason).toBe('empty-evaluation');
    expect(mocks.createViewSurface).not.toHaveBeenCalled();
    expect(router.getOpenTabs()).toEqual([]);
  });

  it('returns failed when onEvaluate rejects', async () => {
    const boom = new Error('evaluate-boom');
    const { router: ready, mocks } = setup([accountList], {
      onEvaluate: vi.fn(async () => {
        throw boom;
      }),
    });
    const router = await ready;
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('failed');
    if (r.outcome === 'failed') expect(r.error).toBe(boom);
    expect(mocks.createViewSurface).not.toHaveBeenCalled();
    expect(mocks.onLog).toHaveBeenCalledWith(
      'error',
      'evaluate-failed',
      boom,
      expect.any(Object),
    );
  });

  it('returns failed when createViewSurface rejects (and emits no tab/history)', async () => {
    const boom = new Error('surface-boom');
    const { router: ready, mocks } = setup([accountList], {
      createViewSurface: vi.fn(async () => {
        throw boom;
      }),
    });
    const router = await ready;
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('failed');
    if (r.outcome === 'failed') expect(r.error).toBe(boom);
    expect(mocks.onNavigate).not.toHaveBeenCalled();
    expect(router.getOpenTabs()).toEqual([]);
    expect(router.getHistory()).toEqual([]);
  });
});

describe('navigate() — beforeNavigate guards', () => {
  it('cancels when a beforeNavigate handler returns cancel:true', async () => {
    const { router: ready, mocks } = setup([accountList]);
    const router = await ready;

    router.onBeforeNavigate(async () => ({ cancel: true, reason: 'unsaved-form' }));
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('cancelled');
    if (r.outcome === 'cancelled') expect(r.reason).toBe('unsaved-form');

    expect(mocks.onEvaluate).not.toHaveBeenCalled();
    expect(router.getOpenTabs()).toEqual([]);
  });

  it('continues when handler returns void', async () => {
    const { router: ready } = setup([accountList]);
    const router = await ready;
    router.onBeforeNavigate(async () => undefined);
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('completed');
  });

  it('handler exception is logged and does not cancel the flow', async () => {
    const { router: ready, mocks } = setup([accountList]);
    const router = await ready;
    router.onBeforeNavigate(async () => {
      throw new Error('handler-boom');
    });
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('completed');
    expect(mocks.onLog).toHaveBeenCalledWith(
      'error',
      'beforeNavigate-handler-threw',
      expect.any(Error),
      expect.any(Object),
    );
  });

  it('first cancelling handler short-circuits later handlers', async () => {
    const { router: ready } = setup([accountList]);
    const router = await ready;
    const second = vi.fn(async () => undefined);
    router.onBeforeNavigate(async () => ({ cancel: true, reason: 'first' }));
    router.onBeforeNavigate(second);
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('cancelled');
    expect(second).not.toHaveBeenCalled();
  });
});

describe('navigate() — onNavigate / context shape', () => {
  it('passes ctx with shellMode + lifetime + presentation + source + resolvedItems', async () => {
    const { router: ready, mocks } = setup([accountList]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-list' });
    const [ctx] = mocks.onNavigate.mock.calls[0] as [NavigateContext, ViewSurface];
    expect(ctx.shellMode).toBe(ShellMode.mdi);
    expect(ctx.lifetime).toBe(RouteLifetime.singleton);
    expect(ctx.presentation).toBe('surface');
    expect(ctx.source).toBe('routeKey');
    expect(ctx.resolvedItems[0]?.key).toBe('account-list');
  });

  it('host onNavigate exception does not break the navigate result', async () => {
    const { router: ready, mocks } = setup([accountList], {
      onNavigate: vi.fn(async () => {
        throw new Error('on-navigate-boom');
      }),
    });
    const router = await ready;
    const r = await router.navigate({ routeKey: 'account-list' });
    expect(r.outcome).toBe('completed');
    expect(mocks.onLog).toHaveBeenCalledWith(
      'error',
      'onNavigate-threw',
      expect.any(Error),
      expect.any(Object),
    );
  });

  it('uses resolvedItems[0] as the surface item even if onEvaluate transforms it', async () => {
    const transformed: NavigationItem = {
      key: 'account-list',
      lifetime: RouteLifetime.singleton,
      config: { resource: 'urn:amorphie:res:view:transformed' },
      resolvedData: [],
      locale: 'tr',
      title: 'Transformed',
    };
    const { router: ready, mocks } = setup([accountList], {
      onEvaluate: vi.fn(async () => [transformed]),
    });
    const router = await ready;
    const r = await router.navigate({ routeKey: 'account-list' });
    if (r.outcome === 'completed') {
      expect(r.resolvedItems[0]).toBe(transformed);
    }
    const [, surface] = mocks.onNavigate.mock.calls[0] as [NavigateContext, ViewSurface];
    expect(surface).toBeDefined();
    const [createArg] = mocks.createViewSurface.mock.calls[0] as [
      { item: NavigationItem; presentation: string },
    ];
    expect(createArg.item).toBe(transformed);
  });
});
