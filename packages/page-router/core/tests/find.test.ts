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

const accountDetail: RouteDefinition = {
  key: 'account-detail',
  config: {},
  inputs: [{ name: 'accountNo', required: true }],
  // Per-instance tabs (transient), so we can stack many of them.
  lifetime: RouteLifetime.transient,
  defaultTitle: { tr: 'Detay {{accountNo}}', en: 'Detail {{accountNo}}' },
};

const dashboard: RouteDefinition = {
  key: 'dashboard',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: 'Anasayfa',
};

const overlayDialog: RouteDefinition = {
  key: 'confirm-dialog',
  config: {},
  presentation: 'overlay',
  inputs: [{ name: 'op' }],
  lifetime: RouteLifetime.transient,
  defaultTitle: 'Onay',
};

describe('PageRouter — findTabs', () => {
  it('returns an empty array when no tabs match the routeKey', async () => {
    const { router: ready } = setup([dashboard]);
    const router = await ready;
    expect(router.findTabs({ routeKey: 'dashboard' })).toEqual([]);
  });

  it('returns every tab with the given routeKey when no payload filter is supplied', async () => {
    const { router: ready } = setup([accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'A' } });
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'B' } });
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'C' } });

    const out = router.findTabs({ routeKey: 'account-detail' });
    expect(out.map((t) => t.payload['accountNo'])).toEqual(['A', 'B', 'C']);
  });

  it('AND-reduces strict primitive equality across every payload field', async () => {
    const route: RouteDefinition = {
      key: 'tx',
      config: {},
      inputs: [{ name: 'accountNo' }, { name: 'currency' }],
      lifetime: RouteLifetime.transient,
      defaultTitle: 't',
    };
    const { router: ready } = setup([route]);
    const router = await ready;
    await router.navigate({ routeKey: 'tx', extraData: { accountNo: 'A', currency: 'TRY' } });
    await router.navigate({ routeKey: 'tx', extraData: { accountNo: 'A', currency: 'USD' } });
    await router.navigate({ routeKey: 'tx', extraData: { accountNo: 'B', currency: 'USD' } });

    const out = router.findTabs({
      routeKey: 'tx',
      payload: { accountNo: 'A', currency: 'USD' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.payload).toMatchObject({ accountNo: 'A', currency: 'USD' });
  });

  it('returns empty when nothing matches the AND filter', async () => {
    const { router: ready } = setup([accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'A' } });

    expect(
      router.findTabs({ routeKey: 'account-detail', payload: { accountNo: 'Z' } }),
    ).toEqual([]);
  });

  it('warns + filters out when a query field value is non-primitive', async () => {
    const { router: ready, mocks } = setup([accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'A' } });

    const out = router.findTabs({
      routeKey: 'account-detail',
      payload: { accountNo: { nested: true } },
    });
    // Spec: "Non-primitive query fields are ignored (warn)." — the field is
    // skipped, so the routeKey filter alone applies → all matching tabs.
    expect(out).toHaveLength(1);
    const warns = mocks.onLog.mock.calls.filter((c) => c[0] === 'warn').map((c) => c[1]);
    expect(warns).toContain('find-key-non-primitive');
  });

  it('warns + drops the holder when a query field is missing in the payload', async () => {
    const { router: ready, mocks } = setup([accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'A' } });

    const out = router.findTabs({
      routeKey: 'account-detail',
      payload: { accountNo: undefined },
    });
    expect(out).toEqual([]);
    const warns = mocks.onLog.mock.calls.filter((c) => c[0] === 'warn').map((c) => c[1]);
    expect(warns).toContain('find-key-missing-value');
  });

  it('does not list tabs that have been closed (live snapshot of TabManager)', async () => {
    const { router: ready } = setup([accountDetail]);
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'A' } });
    const tabKey = router.getOpenTabs()[0]?.tabKey;
    await router.closeTab(tabKey!);

    expect(router.findTabs({ routeKey: 'account-detail' })).toEqual([]);
  });

  it('returns up-to-date NavigationItem snapshots after setLocale', async () => {
    const { router: ready } = setup([accountDetail], { fallbackLocale: 'en' });
    const router = await ready;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: '42' } });

    const before = router.findTabs({ routeKey: 'account-detail' });
    expect(before[0]?.item.title).toBe('Detay 42');

    router.setLocale('en');

    const after = router.findTabs({ routeKey: 'account-detail' });
    expect(after[0]?.item.title).toBe('Detail 42');
    expect(after[0]?.item.locale).toBe('en');
  });
});

describe('PageRouter — findOverlays', () => {
  it('returns an empty array when no overlays match', async () => {
    const { router: ready } = setup([dashboard, overlayDialog]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    expect(router.findOverlays({ routeKey: 'confirm-dialog' })).toEqual([]);
  });

  it('returns every overlay with the given routeKey (no payload filter)', async () => {
    const { router: ready } = setup([dashboard, overlayDialog]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'transfer' } });
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'cancel' } });

    const out = router.findOverlays({ routeKey: 'confirm-dialog' });
    expect(out.map((o) => o.payload['op'])).toEqual(['transfer', 'cancel']);
  });

  it('AND-reduces primitive equality across overlay payload fields', async () => {
    const { router: ready } = setup([dashboard, overlayDialog]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'transfer' } });
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'cancel' } });

    const out = router.findOverlays({
      routeKey: 'confirm-dialog',
      payload: { op: 'cancel' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.payload).toMatchObject({ op: 'cancel' });
  });

  it('does not include overlays that have been dismissed', async () => {
    const { router: ready } = setup([dashboard, overlayDialog]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'transfer' } });
    expect(router.findOverlays({ routeKey: 'confirm-dialog' })).toHaveLength(1);

    await router.goBack(); // top-dismiss
    expect(router.findOverlays({ routeKey: 'confirm-dialog' })).toEqual([]);
  });
});
