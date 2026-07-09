import { describe, expect, it, vi } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  createPageRouter,
  type CreateViewSurface,
  type DisposeViewSurface,
  type IPageRouter,
  type OnLog,
  type OnNavigate,
  type RouteRegistry,
} from '../src/index.js';

/**
 * End-to-end "boot → navigate → switch → back → close" scenario, exercising
 * the whole IPageRouter public surface in one realistic chain. Mirrors the
 * POC main-menu (dashboard + account-list + account-detail + a confirm
 * overlay), with locale switching and homepage management.
 */
describe('PageRouter — public IPageRouter integration scenario', () => {
  it('boots from JSON-config, navigates, locks homepage, swaps locale, goBack, swaps shellMode', async () => {
    const registry: RouteRegistry = {
      config: {
        shellMode: ShellMode.mdi,
        locale: 'tr',
        fallbackLocale: 'en',
        defaultLifetime: RouteLifetime.singleton,
      },
      routes: [
        {
          key: 'dashboard',
          config: {},
          lifetime: RouteLifetime.singleton,
          restoreMode: 'preserve',
          defaultTitle: { tr: 'Anasayfa', en: 'Home' },
        },
        {
          key: 'account-list',
          config: {},
          lifetime: RouteLifetime.singleton,
          restoreMode: 'refresh',
          defaultTitle: { tr: 'Hesaplar', en: 'Accounts' },
        },
        {
          key: 'account-detail',
          config: {},
          inputs: [{ name: 'accountNo', required: true }],
          singletonKey: ['accountNo'],
          lifetime: RouteLifetime.singleton,
          restoreMode: 'preserve',
          defaultTitle: { tr: 'Hesap {{accountNo}}', en: 'Account {{accountNo}}' },
        },
        {
          key: 'confirm-dialog',
          config: {},
          presentation: 'overlay',
          lifetime: RouteLifetime.transient,
          defaultTitle: { tr: 'Onay', en: 'Confirm' },
        },
      ],
    };

    let surfaceSeq = 0;
    const createViewSurface: CreateViewSurface = vi.fn(async ({ handleKey, item }) => ({
      handleKey,
      mount: { handleKey, key: item.key, instance: ++surfaceSeq },
    }));
    const disposeViewSurface: DisposeViewSurface = vi.fn(async () => undefined);
    const onNavigate: OnNavigate = vi.fn(async () => undefined);
    const onLog: OnLog = vi.fn();

    const router: IPageRouter = await createPageRouter({
      routeRegistry: registry,
      onEvaluate: async ({ item }) => [item],
      onNavigate,
      createViewSurface,
      disposeViewSurface,
      onLog,
    });

    // Boot config came from JSON.
    expect(router.getShellMode()).toBe(ShellMode.mdi);
    expect(router.getLocale()).toBe('tr');

    // 1. Set homepage → locks tab + emits onHomepageChanged.
    const homepageEvents: unknown[] = [];
    router.onHomepageChanged((c) => homepageEvents.push(c));
    await router.setHomepage({ routeKey: 'dashboard' });
    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(router.getOpenTabs()[0]?.isPinned).toBe(true);
    expect(router.getOpenTabs()[0]?.isClosable).toBe(false);
    expect(homepageEvents).toEqual([{ routeKey: 'dashboard' }]);

    // 2. Navigate to account-list → second tab.
    await router.navigate({ routeKey: 'account-list' });
    expect(router.getOpenTabs()).toHaveLength(2);
    expect(router.getActiveTab()?.item.title).toBe('Hesaplar');

    // 3. Navigate to multiple account-details (singleton per accountNo).
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'TR-1' } });
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'TR-2' } });
    expect(router.getOpenTabs()).toHaveLength(4);

    // findTabs filters by accountNo.
    const tr2 = router.findTabs({
      routeKey: 'account-detail',
      payload: { accountNo: 'TR-2' },
    });
    expect(tr2).toHaveLength(1);
    expect(tr2[0]?.item.title).toBe('Hesap TR-2');

    // 4. Re-navigate to TR-1 → singleton fast-path (no new createViewSurface).
    const createsBefore = (createViewSurface as ReturnType<typeof vi.fn>).mock.calls.length;
    await router.navigate({ routeKey: 'account-detail', extraData: { accountNo: 'TR-1' } });
    expect((createViewSurface as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      createsBefore,
    );
    expect(router.getActiveTab()?.payload['accountNo']).toBe('TR-1');

    // 5. Open a confirm overlay → underlay tab key matches the active tab.
    await router.navigate({ routeKey: 'confirm-dialog', extraData: { op: 'transfer' } });
    const overlays = router.getActiveView()?.overlays ?? [];
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.underlayTabKey).toBe(router.getActiveTab()?.tabKey);

    // 6. goBack with overlay → top-dismiss instead of cursor move.
    const result = await router.goBack();
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.reason).toBe('overlay-dismissed-instead');
    }
    expect(router.getActiveView()?.overlays ?? []).toHaveLength(0);

    // 7. setLocale → titles re-resolve across tabs + history.
    router.setLocale('en');
    expect(router.getActiveTab()?.item.title).toBe('Account TR-1');
    expect(router.findTabs({ routeKey: 'dashboard' })[0]?.item.title).toBe('Home');

    // 8. goBack pops history (no overlay in the way) → previous tab activates.
    await router.goBack();
    expect(router.getActiveTab()?.item.key).toBe('account-detail');
    expect(router.getActiveTab()?.payload['accountNo']).toBe('TR-2');

    // 9. setShellMode mdi→sdi → sweeps non-active tabs, dismisses overlays
    //    (none open here), keeps the active tab + homepage state.
    const shellEvents: ShellMode[] = [];
    router.onShellModeChanged((m) => shellEvents.push(m));

    await router.setShellMode(ShellMode.sdi);
    expect(shellEvents).toEqual([ShellMode.sdi]);
    expect(router.getOpenTabs()).toHaveLength(1);
    expect(router.getOpenTabs()[0]?.payload['accountNo']).toBe('TR-2');
    // Homepage state survives, even though the homepage tab itself was swept.
    expect(router.getHomepage()).toEqual({ routeKey: 'dashboard' });
    expect(homepageEvents).toEqual([{ routeKey: 'dashboard' }]); // not re-fired.

    // 10. setHomepage(null) — unlock semantics. Tab is not present here so
    //     the call is a state-only reset.
    await router.setHomepage(null);
    expect(router.getHomepage()).toBeNull();
    expect(homepageEvents.at(-1)).toBeNull();

    // 11. Close the remaining tab → no homepage lock anymore, normal close.
    const remainingKey = router.getOpenTabs()[0]?.tabKey;
    await router.closeTab(remainingKey!);
    expect(router.getOpenTabs()).toHaveLength(0);
    expect(disposeViewSurface).toHaveBeenCalled();
  });

  it('markTabDirty toggles isDirty flag and emits onTabDirtyChanged exactly once per real change', async () => {
    // Spec §"Dirty state": SDK tracks the boolean and emits a signal so the
    // host shell can paint a dirty marker / gate close confirmation. SDK
    // itself never renders confirm UI.
    const registry: RouteRegistry = {
      config: { shellMode: ShellMode.mdi, locale: 'tr' },
      routes: [
        {
          key: 'form',
          config: {},
          lifetime: RouteLifetime.singleton,
          defaultTitle: { tr: 'Form' },
        },
      ],
    };
    const createViewSurface: CreateViewSurface = async ({ handleKey }) => ({
      handleKey,
      mount: { __mock: handleKey },
    });
    const disposeViewSurface: DisposeViewSurface = async () => undefined;
    const onNavigate: OnNavigate = async () => undefined;
    const router = await createPageRouter({
      routeRegistry: registry,
      onEvaluate: async ({ item }) => [item],
      onNavigate,
      createViewSurface,
      disposeViewSurface,
    });

    await router.navigate({ routeKey: 'form' });
    const tabKey = router.getActiveTab()!.tabKey;
    expect(router.getActiveTab()?.isDirty).toBe(false);

    const dirtyEvents: boolean[] = [];
    router.onTabDirtyChanged((t) => dirtyEvents.push(t.isDirty));

    router.markTabDirty(tabKey, true);
    router.markTabDirty(tabKey, true); // no-op (already dirty)
    router.markTabDirty(tabKey, false);
    router.markTabDirty(tabKey, false); // no-op (already clean)

    expect(dirtyEvents).toEqual([true, false]);
    expect(router.getActiveTab()?.isDirty).toBe(false);

    // Unknown tabKey → warn-only, no throw, no signal.
    router.markTabDirty('does-not-exist', true);
    expect(dirtyEvents).toEqual([true, false]);
  });
});
