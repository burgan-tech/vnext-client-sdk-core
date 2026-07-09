import {
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import type {
  HistoryEntry,
  HomepageConfig,
  IPageRouter,
  OpenOverlay,
  OpenTab,
  ShellMode,
} from 'page-router';

/**
 * Reactive view of the page-router state. Subscribes to all relevant signals
 * on mount and unsubscribes on scope dispose, so consumers just read the refs
 * and get auto-update without managing handlers themselves.
 */
export interface PageRouterReactive {
  readonly router: IPageRouter;
  readonly openTabs: ShallowRef<ReadonlyArray<OpenTab>>;
  readonly activeTab: ShallowRef<OpenTab | null>;
  readonly overlays: ShallowRef<ReadonlyArray<OpenOverlay>>;
  readonly history: ShallowRef<ReadonlyArray<HistoryEntry>>;
  readonly shellMode: Ref<ShellMode>;
  readonly locale: Ref<string>;
  readonly homepage: ShallowRef<HomepageConfig | null>;
}

export function usePageRouter(router: IPageRouter): PageRouterReactive {
  // IMPORTANT: SDK getters return the *internal* array reference (cheap reads).
  // We always clone before assigning to a shallowRef so Vue actually triggers
  // reactivity — `shallowRef` only fires when the new value !== old via
  // `Object.is`, so handing the same array back is a silent no-op that leaves
  // the UI showing a stale tab list. Bug seen in practice: closing the X
  // button on a tab fired `closeTab(staleKey)` because the rendered list never
  // updated after open/close events.
  const openTabs = shallowRef<ReadonlyArray<OpenTab>>([...router.getOpenTabs()]);
  const activeTab = shallowRef<OpenTab | null>(router.getActiveTab());
  const overlays = shallowRef<ReadonlyArray<OpenOverlay>>(
    [...(router.getActiveView()?.overlays ?? [])],
  );
  const history = shallowRef<ReadonlyArray<HistoryEntry>>([...router.getHistory()]);
  const shellMode = ref(router.getShellMode()) as Ref<ShellMode>;
  const locale = ref(router.getLocale());
  const homepage = shallowRef<HomepageConfig | null>(router.getHomepage());

  const refreshTabs = (): void => {
    openTabs.value = [...router.getOpenTabs()];
    activeTab.value = router.getActiveTab();
  };
  const refreshOverlays = (): void => {
    overlays.value = [...(router.getActiveView()?.overlays ?? [])];
  };
  const refreshHistory = (): void => {
    history.value = [...router.getHistory()];
  };

  const subs = [
    router.onTabOpened(refreshTabs),
    router.onTabClosed(refreshTabs),
    router.onTabActivated(refreshTabs),
    router.onTabPinned(refreshTabs),
    router.onTabUnpinned(refreshTabs),
    router.onTabDirtyChanged(refreshTabs),
    router.onOverlayOpened(refreshOverlays),
    router.onOverlayClosed(refreshOverlays),
    router.onShellModeChanged((m) => {
      shellMode.value = m;
      refreshTabs();
      refreshOverlays();
    }),
    router.onLocaleChanged((l) => {
      locale.value = l;
      refreshTabs();
      refreshOverlays();
      refreshHistory();
    }),
    router.onHomepageChanged((h) => {
      homepage.value = h;
      refreshTabs();
    }),
    router.onHistoryChanged(refreshHistory),
  ];

  onScopeDispose(() => {
    for (const s of subs) s.unsubscribe();
  });

  return {
    router,
    openTabs,
    activeTab,
    overlays,
    history,
    shellMode,
    locale,
    homepage,
  };
}
