import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type CreateViewSurface,
  type DisposeViewSurface,
  type IPageRouter,
  type RouteRegistry,
} from '../src/index.js';

function makeRegistry(): RouteRegistry {
  return {
    config: { shellMode: ShellMode.mdi, locale: 'en' },
    routes: [
      {
        key: 'detail',
        config: {},
        inputs: [{ name: 'accountNo', required: true }],
        singletonKey: ['accountNo'],
        lifetime: RouteLifetime.singleton,
        restoreMode: 'refresh',
        defaultTitle: { en: 'Detail {{accountNo}}' },
      },
      {
        key: 'preserved',
        config: {},
        lifetime: RouteLifetime.singleton,
        restoreMode: 'preserve',
        defaultTitle: { en: 'Preserved' },
      },
      {
        key: 'transient-form',
        config: {},
        lifetime: RouteLifetime.transient,
        restoreMode: 'preserve',
        defaultTitle: { en: 'Form' },
      },
      {
        key: 'overlay',
        config: {},
        presentation: 'overlay',
        lifetime: RouteLifetime.transient,
        defaultTitle: { en: 'Overlay' },
      },
    ],
  };
}

async function bootRouter(opts?: {
  createViewSurface?: CreateViewSurface;
  disposeViewSurface?: DisposeViewSurface;
}): Promise<IPageRouter> {
  let seq = 0;
  const createViewSurface: CreateViewSurface =
    opts?.createViewSurface ??
    vi.fn(async ({ handleKey }) => ({ handleKey, mount: { id: ++seq } }));
  const disposeViewSurface: DisposeViewSurface =
    opts?.disposeViewSurface ?? vi.fn(async () => undefined);
  return createPageRouter({
    routeRegistry: makeRegistry(),
    onEvaluate: async ({ item }) => [item],
    onNavigate: async () => undefined,
    createViewSurface,
    disposeViewSurface,
  });
}

describe('IPageRouter.activateTab', () => {
  it('warns + cancels on unknown tabKey', async () => {
    const router = await bootRouter();
    const result = await router.activateTab('does-not-exist');
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('tab-not-found');
    }
  });

  it('refresh restoreMode disposes + recreates the surface in place', async () => {
    const create = vi.fn(async ({ handleKey }: { handleKey: string }) => ({
      handleKey,
      mount: { rev: Math.random() },
    }));
    const dispose = vi.fn(async () => undefined);
    const router = await bootRouter({
      createViewSurface: create,
      disposeViewSurface: dispose,
    });

    await router.navigate({ routeKey: 'detail', extraData: { accountNo: 'A' } });
    await router.navigate({ routeKey: 'detail', extraData: { accountNo: 'B' } });
    expect(router.getActiveTab()?.payload['accountNo']).toBe('B');

    const tabA = router.findTabs({ routeKey: 'detail', payload: { accountNo: 'A' } })[0]!;
    const surfaceBefore = tabA.surface;
    const createsBefore = create.mock.calls.length;

    const result = await router.activateTab(tabA.tabKey);

    expect(result.outcome).toBe('completed');
    expect(router.getActiveTab()?.tabKey).toBe(tabA.tabKey);
    expect(dispose).toHaveBeenCalledWith(surfaceBefore);
    expect(create.mock.calls.length).toBe(createsBefore + 1);
    expect(router.getActiveTab()?.surface).not.toBe(surfaceBefore);
  });

  it('preserve restoreMode keeps the surface (no dispose, no createViewSurface)', async () => {
    const create = vi.fn(async ({ handleKey }: { handleKey: string }) => ({
      handleKey,
      mount: {},
    }));
    const dispose = vi.fn(async () => undefined);
    const router = await bootRouter({
      createViewSurface: create,
      disposeViewSurface: dispose,
    });

    await router.navigate({ routeKey: 'preserved' });
    await router.navigate({ routeKey: 'detail', extraData: { accountNo: 'X' } });
    const preservedTab = router.findTabs({ routeKey: 'preserved' })[0]!;
    const surfaceBefore = preservedTab.surface;
    const createsBefore = create.mock.calls.length;

    await router.activateTab(preservedTab.tabKey);

    expect(router.getActiveTab()?.tabKey).toBe(preservedTab.tabKey);
    expect(router.getActiveTab()?.surface).toBe(surfaceBefore);
    expect(dispose).not.toHaveBeenCalled();
    expect(create.mock.calls.length).toBe(createsBefore);
  });

  it('emits onTabActivated and pushes a history entry', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'preserved' });
    await router.navigate({ routeKey: 'detail', extraData: { accountNo: 'X' } });

    const events: string[] = [];
    router.onTabActivated((t) => events.push(t.tabKey));
    const histBefore = router.getHistory().length;

    const preservedKey = router.findTabs({ routeKey: 'preserved' })[0]!.tabKey;
    await router.activateTab(preservedKey);

    expect(events).toContain(preservedKey);
    expect(router.getHistory().length).toBe(histBefore + 1);
    expect(router.getHistory().at(-1)?.tabKey).toBe(preservedKey);
  });

  it('dismisses any open overlays when activating a surface', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'preserved' });
    await router.navigate({ routeKey: 'detail', extraData: { accountNo: 'X' } });
    await router.navigate({ routeKey: 'overlay' });
    expect(router.getActiveView()?.overlays).toHaveLength(1);

    const preservedKey = router.findTabs({ routeKey: 'preserved' })[0]!.tabKey;
    await router.activateTab(preservedKey);

    expect(router.getActiveView()?.overlays).toHaveLength(0);
  });

  it('activates a transient tab without creating a duplicate', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'transient-form' });
    await router.navigate({ routeKey: 'transient-form' });
    expect(router.getOpenTabs()).toHaveLength(2);
    const firstKey = router.getOpenTabs()[0]!.tabKey;

    await router.activateTab(firstKey);

    expect(router.getOpenTabs()).toHaveLength(2);
    expect(router.getActiveTab()?.tabKey).toBe(firstKey);
  });
});

describe('IPageRouter.closeOverlay / dismissTopOverlay', () => {
  it('closeOverlay disposes the surface and fires onOverlayClosed', async () => {
    const dispose = vi.fn(async () => undefined);
    const router = await bootRouter({ disposeViewSurface: dispose });
    await router.navigate({ routeKey: 'preserved' });
    await router.navigate({ routeKey: 'overlay' });

    const overlayKey = router.getActiveView()!.overlays[0]!.overlayKey;
    let closedKey: string | undefined;
    router.onOverlayClosed((k) => {
      closedKey = k;
    });

    await router.closeOverlay(overlayKey);

    expect(router.getActiveView()?.overlays).toHaveLength(0);
    expect(dispose).toHaveBeenCalled();
    expect(closedKey).toBe(overlayKey);
  });

  it('closeOverlay warns + no-ops on unknown overlayKey', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'preserved' });
    // Should not throw, and overlay stack remains untouched.
    await router.closeOverlay('nope');
    expect(router.getActiveView()?.overlays).toHaveLength(0);
  });

  it('dismissTopOverlay closes only the topmost overlay', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'preserved' });
    await router.navigate({ routeKey: 'overlay' });
    await router.navigate({ routeKey: 'overlay' });
    expect(router.getActiveView()?.overlays).toHaveLength(2);

    const top = router.getActiveView()!.overlays.at(-1)!.overlayKey;
    await router.dismissTopOverlay();

    const remaining = router.getActiveView()!.overlays;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.overlayKey).not.toBe(top);
  });

  it('dismissTopOverlay is a no-op when stack is empty', async () => {
    const router = await bootRouter();
    await router.navigate({ routeKey: 'preserved' });
    await router.dismissTopOverlay();
    expect(router.getActiveView()?.overlays ?? []).toHaveLength(0);
  });
});
