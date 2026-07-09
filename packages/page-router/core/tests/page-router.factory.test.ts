import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type IPageRouter,
  type OnLog,
  type PageRouterOptions,
  type RouteDefinition,
  type RouteRegistry,
} from '../src/index.js';

const baseRoute: RouteDefinition = {
  key: 'r',
  config: {},
  lifetime: RouteLifetime.singleton,
};

function options(over: Partial<PageRouterOptions>): PageRouterOptions {
  const registry: RouteRegistry = { routes: [baseRoute] };
  return {
    routeRegistry: registry,
    onEvaluate: () => Promise.resolve({ ok: true, item: over.routeRegistry as never }),
    onNavigate: () => Promise.resolve(),
    createViewSurface: ({ handleKey }) =>
      Promise.resolve({ handleKey, mount: { handleKey } }),
    ...over,
  } as PageRouterOptions;
}

describe('createPageRouter — config-oriented init', () => {
  it('initializes from code-only options', async () => {
    const router: IPageRouter = await createPageRouter(
      options({ shellMode: ShellMode.sdi, locale: 'tr' }),
    );
    expect(router.getShellMode()).toBe(ShellMode.sdi);
    expect(router.getLocale()).toBe('tr');
  });

  it('initializes from JSON-only registry.config', async () => {
    const registry: RouteRegistry = {
      config: {
        shellMode: ShellMode.mdi,
        locale: 'en',
        fallbackLocale: 'tr',
      },
      routes: [baseRoute],
    };
    const router = await createPageRouter(options({ routeRegistry: registry }));
    expect(router.getShellMode()).toBe(ShellMode.mdi);
    expect(router.getLocale()).toBe('en');
  });

  it('code overrides JSON when both provide a value', async () => {
    const registry: RouteRegistry = {
      config: { shellMode: ShellMode.mdi, locale: 'en' },
      routes: [baseRoute],
    };
    const router = await createPageRouter(
      options({ routeRegistry: registry, shellMode: ShellMode.sdi, locale: 'tr' }),
    );
    expect(router.getShellMode()).toBe(ShellMode.sdi);
    expect(router.getLocale()).toBe('tr');
  });

  it('rejects with init-config-missing when neither side supplies the required fields', async () => {
    const onLog = vi.fn<OnLog>();
    await expect(createPageRouter(options({ onLog }))).rejects.toMatchObject({
      code: 'init-config-missing',
      missing: expect.arrayContaining(['shellMode', 'locale']),
    });
    expect(onLog).toHaveBeenCalledWith(
      'error',
      'init-config-missing',
      undefined,
      expect.objectContaining({
        missing: expect.arrayContaining(['shellMode', 'locale']),
      }),
    );
  });

  it('awaits a function-form routeRegistry', async () => {
    const registry: RouteRegistry = {
      config: { shellMode: ShellMode.sdi, locale: 'tr' },
      routes: [baseRoute],
    };
    const loader = vi.fn(async () => registry);
    const router = await createPageRouter(options({ routeRegistry: loader }));
    expect(loader).toHaveBeenCalledOnce();
    expect(router.getShellMode()).toBe(ShellMode.sdi);
  });

  it('propagates registry-loader rejections via onLog.error', async () => {
    const onLog = vi.fn<OnLog>();
    const boom = new Error('boom');
    await expect(
      createPageRouter(
        options({
          shellMode: ShellMode.sdi,
          locale: 'tr',
          onLog,
          routeRegistry: () => Promise.reject(boom),
        }),
      ),
    ).rejects.toBe(boom);
    expect(onLog).toHaveBeenCalledWith(
      'error',
      'route-registry-load-failed',
      boom,
      expect.any(Object),
    );
  });
});

describe('PageRouter — read-only API initial state', () => {
  async function fresh(): Promise<IPageRouter> {
    return createPageRouter(options({ shellMode: ShellMode.mdi, locale: 'tr' }));
  }

  it('exposes the registry pass-through', async () => {
    const router = await fresh();
    expect(router.getRouteRegistry().routes).toHaveLength(1);
    expect(router.findRoute('r')).toBe(router.getRouteRegistry().routes[0]);
    expect(router.findRoute('nope')).toBeNull();
  });

  it('starts with empty tab/overlay/history state', async () => {
    const router = await fresh();
    expect(router.getOpenTabs()).toEqual([]);
    expect(router.getActiveTab()).toBeNull();
    expect(router.getActiveView()).toBeNull();
    expect(router.getHistory()).toEqual([]);
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(false);
    expect(router.getHomepage()).toBeNull();
  });

  it('findTabs / findOverlays return empty arrays initially', async () => {
    const router = await fresh();
    expect(router.findTabs({ routeKey: 'r' })).toEqual([]);
    expect(router.findOverlays({ routeKey: 'r' })).toEqual([]);
  });
});

describe('PageRouter — subscriptions', () => {
  it('onHistoryChanged fires after clearHistory and the subscription is cancellable', async () => {
    const router = await createPageRouter(
      options({ shellMode: ShellMode.mdi, locale: 'tr' }),
    );
    const handler = vi.fn();
    const sub = router.onHistoryChanged(handler);
    router.clearHistory();
    expect(handler).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
    router.clearHistory();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handlers from different events stay isolated', async () => {
    const router = await createPageRouter(
      options({ shellMode: ShellMode.mdi, locale: 'tr' }),
    );
    const tabClosed = vi.fn();
    const localeChanged = vi.fn();
    router.onTabClosed(tabClosed);
    router.onLocaleChanged(localeChanged);
    router.clearHistory();
    expect(tabClosed).not.toHaveBeenCalled();
    expect(localeChanged).not.toHaveBeenCalled();
  });
});
