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
    fallbackLocale: 'en',
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

const localizedDashboard: RouteDefinition = {
  key: 'dashboard',
  config: {},
  lifetime: RouteLifetime.singleton,
  defaultTitle: { tr: 'Anasayfa', en: 'Dashboard' },
  defaultSubtitle: { tr: 'Hoş geldin', en: 'Welcome' },
};

const interpolatedRoute: RouteDefinition = {
  key: 'account-detail',
  config: {},
  inputs: [{ name: 'accountNo', required: true }],
  lifetime: RouteLifetime.transient,
  defaultTitle: { tr: 'Hesap {{accountNo}}', en: 'Account {{accountNo}}' },
};

const overlayHelp: RouteDefinition = {
  key: 'help',
  config: {},
  presentation: 'overlay',
  lifetime: RouteLifetime.transient,
  defaultTitle: { tr: 'Yardım', en: 'Help' },
};

describe('PageRouter — setLocale', () => {
  it('same-locale call re-emits onLocaleChanged for self-heal (no re-resolve)', async () => {
    // Re-emit lets late-mounted observers (Vue HMR replays, custom host
    // shells) catch the canonical locale; we still skip the title/subtitle
    // re-resolve pass because nothing actually changed.
    const { router: ready } = setup([localizedDashboard]);
    const router = await ready;
    const onLocale = vi.fn();
    router.onLocaleChanged(onLocale);
    router.setLocale('tr');
    expect(onLocale).toHaveBeenCalledTimes(1);
    expect(onLocale.mock.calls[0]?.[0]).toBe('tr');
  });

  it('different-locale call updates getLocale + emits onLocaleChanged', async () => {
    const { router: ready } = setup([localizedDashboard]);
    const router = await ready;
    const onLocale = vi.fn();
    router.onLocaleChanged(onLocale);

    router.setLocale('en');
    expect(router.getLocale()).toBe('en');
    expect(onLocale).toHaveBeenCalledOnce();
    expect(onLocale.mock.calls[0]?.[0]).toBe('en');
  });

  it('re-resolves the title/subtitle of every open tab in the new locale', async () => {
    const { router: ready } = setup([localizedDashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });

    const tab = router.getOpenTabs()[0]!;
    expect(tab.item.title).toBe('Anasayfa');
    expect(tab.item.subtitle).toBe('Hoş geldin');
    expect(tab.item.locale).toBe('tr');

    router.setLocale('en');

    const updated = router.getOpenTabs()[0]!;
    expect(updated.tabKey).toBe(tab.tabKey);
    expect(updated.item.title).toBe('Dashboard');
    expect(updated.item.subtitle).toBe('Welcome');
    expect(updated.item.locale).toBe('en');
    // Payload + surface untouched.
    expect(updated.payload).toBe(tab.payload);
    expect(updated.surface).toBe(tab.surface);
  });

  it('re-runs payload interpolation on the new locale template', async () => {
    const { router: ready } = setup([interpolatedRoute]);
    const router = await ready;
    await router.navigate({
      routeKey: 'account-detail',
      extraData: { accountNo: 'TR-42' },
    });
    expect(router.getOpenTabs()[0]?.item.title).toBe('Hesap TR-42');

    router.setLocale('en');
    expect(router.getOpenTabs()[0]?.item.title).toBe('Account TR-42');
  });

  it('also re-resolves overlay items', async () => {
    const { router: ready } = setup([localizedDashboard, overlayHelp]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    await router.navigate({ routeKey: 'help' });
    const overlays = router.getActiveView()?.overlays ?? [];
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.item.title).toBe('Yardım');

    router.setLocale('en');
    const after = router.getActiveView()?.overlays ?? [];
    expect(after[0]?.item.title).toBe('Help');
    expect(after[0]?.item.locale).toBe('en');
  });

  it('also re-resolves history entry items', async () => {
    const { router: ready } = setup([localizedDashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    const beforeEntries = router.getHistory();
    expect(beforeEntries[0]?.item.title).toBe('Anasayfa');

    const onHistory = vi.fn();
    router.onHistoryChanged(onHistory);

    router.setLocale('en');
    const afterEntries = router.getHistory();
    expect(afterEntries[0]?.item.title).toBe('Dashboard');
    expect(onHistory).toHaveBeenCalled();
  });

  it('does NOT call onEvaluate / createViewSurface (data fetch is unchanged)', async () => {
    const { router: ready, mocks } = setup([localizedDashboard]);
    const router = await ready;
    await router.navigate({ routeKey: 'dashboard' });
    const evalsBefore = mocks.onEvaluate.mock.calls.length;
    const createsBefore = mocks.createViewSurface.mock.calls.length;
    const disposesBefore = mocks.disposeViewSurface.mock.calls.length;

    router.setLocale('en');

    expect(mocks.onEvaluate.mock.calls.length).toBe(evalsBefore);
    expect(mocks.createViewSurface.mock.calls.length).toBe(createsBefore);
    expect(mocks.disposeViewSurface.mock.calls.length).toBe(disposesBefore);
  });

  it('logs info "locale-changed"', async () => {
    const { router: ready, mocks } = setup([localizedDashboard]);
    const router = await ready;
    router.setLocale('en');
    const infos = mocks.onLog.mock.calls.filter((c) => c[0] === 'info').map((c) => c[1]);
    expect(infos).toContain('locale-changed');
  });
});
