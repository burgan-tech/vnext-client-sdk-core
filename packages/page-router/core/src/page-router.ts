import { RouteLifetime, ShellMode } from './enums.js';
import type { ShellModeConflictPolicy } from './enums.js';
import { mergeInitConfig, type ResolvedInitConfig } from './internal/init-config.js';
import { createLogger, type Logger } from './internal/logger.js';
import { createSignal } from './internal/signal.js';
import { HistoryManager } from './internal/history-manager.js';
import { OverlayStack } from './internal/overlay-stack.js';
import { TabManager } from './internal/tab-manager.js';
import { findSingletonMatch, matchPayloadQuery } from './internal/identity.js';
import { buildNavigationItem, resolveRoutePayload } from './internal/route-resolver.js';
import type {
  ActiveViewSnapshot,
  AfterNavigateHandler,
  BeforeNavigateHandler,
  CreateViewSurface,
  DisposeViewSurface,
  FindQuery,
  HistoryEntry,
  HomepageConfig,
  IPageRouter,
  NavigateContext,
  NavigateRequest,
  NavigateResult,
  NavigationItem,
  OnEvaluate,
  OnNavigate,
  OpenOverlay,
  OpenTab,
  PageRouterOptions,
  RouteDefinition,
  RouteRegistry,
  Subscription,
  ViewSurface,
} from './types.js';
import type { PresentationMode, RestoreMode, NavigateSource } from './enums.js';

/**
 * Concrete `IPageRouter` implementation. Constructed exclusively via
 * {@link PageRouter.create} so we can run async setup (registry resolution,
 * config merge, init validation) before exposing a router instance.
 *
 * This file currently holds the **factory + read-only API + event bus**
 * scaffolding. Action surface (`navigate`, `setShellMode`, `setLocale`,
 * `setHomepage`, `goHome`, `goBack`, `goForward`, `activateTab`, `closeTab`,
 * `closeOverlay`, `dismissTopOverlay`) is filled in iteratively by the
 * following TDD slices.
 */
export class PageRouter implements IPageRouter {
  // --- Init / immutable services ---
  private readonly registry: RouteRegistry;
  private readonly onEvaluate: OnEvaluate;
  private readonly onNavigate: OnNavigate;
  private readonly createViewSurface: CreateViewSurface;
  private readonly disposeViewSurface: DisposeViewSurface | undefined;
  private readonly logger: Logger;
  private readonly defaultLifetime: RouteLifetime;
  private readonly defaultShellModeOnConflict: ShellModeConflictPolicy;
  private readonly fallbackLocale: string | undefined;

  // --- Mutable state ---
  private shellMode!: ShellMode;
  private locale: string;
  private homepage: HomepageConfig | null = null;
  // Tab key currently bound to homepage identity (if any). Used by the
  // homepage swap flow + `goHome()` fast path.
  private homepageTabKey: string | null = null;

  private readonly tabs: TabManager;
  private readonly history: HistoryManager;
  private readonly overlays: OverlayStack;

  // beforeNavigate / afterNavigate need sequential await + cancel-aware
  // semantics, so they are NOT wired to the generic `Signal` event bus
  // (which dispatches synchronously and ignores handler return values).
  private readonly beforeNavigateHandlers: BeforeNavigateHandler[] = [];
  private readonly afterNavigateHandlers: AfterNavigateHandler[] = [];

  // Per-route monotonic counters used to mint deterministic tab/overlay
  // handles. Per-route (instead of a single shared counter) keeps generated
  // keys readable (`account-detail--1`, `account-detail--2`, ...) and means
  // a counter desync on one route can never collide with another. The mint
  // helpers also defensively skip already-taken keys, so even if a counter
  // somehow rewinds (HMR, manual reset) we never throw `tab-already-exists`
  // from `addTab`.
  private readonly tabCounters = new Map<string, number>();
  private readonly overlayCounters = new Map<string, number>();

  // --- Signals (one per public event topic) ---
  private readonly sigTabOpened = createSignal<OpenTab>();
  private readonly sigTabClosed = createSignal<string>();
  private readonly sigTabActivated = createSignal<OpenTab>();
  private readonly sigTabPinned = createSignal<OpenTab>();
  private readonly sigTabUnpinned = createSignal<OpenTab>();
  private readonly sigTabDirtyChanged = createSignal<OpenTab>();
  private readonly sigShellModeChanged = createSignal<ShellMode>();
  private readonly sigOverlayOpened = createSignal<OpenOverlay>();
  private readonly sigOverlayClosed = createSignal<string>();
  private readonly sigHomepageChanged = createSignal<HomepageConfig | null>();
  private readonly sigHistoryChanged = createSignal<ReadonlyArray<HistoryEntry>>();
  private readonly sigLocaleChanged = createSignal<string>();

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  private constructor(args: PageRouterCtorArgs) {
    this.registry = args.registry;
    this.onEvaluate = args.options.onEvaluate;
    this.onNavigate = args.options.onNavigate;
    this.createViewSurface = args.options.createViewSurface;
    this.disposeViewSurface = args.options.disposeViewSurface;
    this.logger = args.logger;
    this.shellMode = args.init.shellMode;
    this.locale = args.init.locale;
    this.fallbackLocale = args.init.fallbackLocale;
    this.defaultLifetime = args.init.defaultLifetime;
    this.defaultShellModeOnConflict = args.init.defaultShellModeOnConflict;

    this.tabs = new TabManager({ logger: this.logger.with({ subsystem: 'tabs' }) });
    this.history = new HistoryManager();
    this.overlays = new OverlayStack();
    // `defaultShellModeOnConflict` (ShellModeConflictPolicy) is declared and
    // defaulted but not yet enforced by navigate — referenced here so the field
    // survives `noUnusedLocals` until the policy is implemented or dropped.
    void this.defaultShellModeOnConflict;
  }

  /**
   * Async factory. Steps:
   *
   *   1. Resolve `routeRegistry` (sync object or `() => Promise<...>`).
   *   2. Merge `options` with `registry.config` (code > JSON > SDK defaults).
   *   3. Reject with `init-config-missing` when `shellMode` / `locale` is absent.
   *   4. Construct `PageRouter` with frozen init snapshot.
   */
  static async create(options: PageRouterOptions): Promise<IPageRouter> {
    const logger = createLogger(options.onLog, { module: 'page-router' });

    let registry: RouteRegistry;
    try {
      registry =
        typeof options.routeRegistry === 'function'
          ? await options.routeRegistry()
          : options.routeRegistry;
    } catch (err) {
      logger.error('route-registry-load-failed', err);
      throw err;
    }

    const merged = mergeInitConfig(
      {
        ...(options.shellMode !== undefined ? { shellMode: options.shellMode } : {}),
        ...(options.locale !== undefined ? { locale: options.locale } : {}),
        ...(options.fallbackLocale !== undefined
          ? { fallbackLocale: options.fallbackLocale }
          : {}),
        ...(options.defaultLifetime !== undefined
          ? { defaultLifetime: options.defaultLifetime }
          : {}),
        ...(options.defaultShellModeOnConflict !== undefined
          ? { defaultShellModeOnConflict: options.defaultShellModeOnConflict }
          : {}),
      },
      registry.config,
    );

    if (!merged.ok) {
      logger.error('init-config-missing', undefined, { missing: merged.missing });
      const err: Error & { code?: string; missing?: string[] } = new Error(
        `page-router: init-config-missing (${merged.missing.join(', ')})`,
      );
      err.code = 'init-config-missing';
      err.missing = merged.missing;
      throw err;
    }

    logger.debug('init-config-resolved', undefined, {
      shellMode: merged.config.shellMode,
      locale: merged.config.locale,
      fallbackLocale: merged.config.fallbackLocale,
      defaultLifetime: merged.config.defaultLifetime,
      defaultShellModeOnConflict: merged.config.defaultShellModeOnConflict,
      routeCount: registry.routes.length,
    });

    return new PageRouter({
      registry,
      options,
      init: merged.config,
      logger,
    });
  }

  // ---------------------------------------------------------------------------
  // Read-only API
  // ---------------------------------------------------------------------------

  getRouteRegistry(): RouteRegistry {
    return this.registry;
  }

  findRoute(routeKey: string): RouteDefinition | null {
    return this.registry.routes.find((r) => r.key === routeKey) ?? null;
  }

  getShellMode(): ShellMode {
    return this.shellMode;
  }

  getLocale(): string {
    return this.locale;
  }

  getHomepage(): HomepageConfig | null {
    return this.homepage;
  }

  getOpenTabs(): ReadonlyArray<OpenTab> {
    return this.tabs.listTabs();
  }

  getActiveTab(): OpenTab | null {
    return this.tabs.getActiveTab();
  }

  getActiveView(): ActiveViewSnapshot | null {
    const active = this.tabs.getActiveTab();
    const stack = this.overlays.getStack();
    if (!active && stack.length === 0) return null;
    return {
      underlay: active ? active.item : null,
      overlays: stack,
    };
  }

  getHistory(): ReadonlyArray<HistoryEntry> {
    return this.history.getEntries();
  }

  canGoBack(): boolean {
    // When an overlay is open, goBack dismisses the top overlay rather than
    // walking the chronological stack — so we expose `true` whenever there's
    // anything to dismiss either way (spec → "goBack open overlay = dismiss").
    if (this.overlays.getTop()) return true;
    return this.history.canGoBack();
  }

  canGoForward(): boolean {
    return this.history.canGoForward();
  }

  findTabs(query: FindQuery): ReadonlyArray<OpenTab> {
    return matchPayloadQuery(this.tabs.listTabs(), query, { logger: this.logger });
  }

  findOverlays(query: FindQuery): ReadonlyArray<OpenOverlay> {
    return matchPayloadQuery(this.overlays.getStack(), query, { logger: this.logger });
  }

  // ---------------------------------------------------------------------------
  // Action API — full implementations land in subsequent TDD slices
  // ---------------------------------------------------------------------------

  async navigate(request: NavigateRequest): Promise<NavigateResult> {
    this.logger.debug('navigate-public-call', undefined, {
      routeKey: request.routeKey,
      hasRouteDefinition: !!request.routeDefinition,
    });
    return this.runNavigate(request);
  }

  async setShellMode(mode: ShellMode): Promise<NavigateResult> {
    this.logger.debug('setShellMode-enter', undefined, {
      from: this.shellMode,
      to: mode,
    });
    if (mode === this.shellMode) {
      // Spec/host contract: still re-emit so external observers (e.g. Vue
      // `shallowRef`) can self-heal if they ever desynced (HMR, missed
      // signal, custom shell mounted late). Emitting an identical value is
      // a cheap no-op for ref-style consumers (Object.is short-circuits)
      // but bullet-proof for ones that re-pull from the source on tick.
      this.logger.debug('setShellMode-noop-same-mode');
      this.sigShellModeChanged.emit(mode);
      return this.syntheticCompleted();
    }
    // Spec: "mod değişmeden önce açık overlay stack'inin tamamı dismiss
    // edilir" — overlays bound to underlay tabs lose meaning on shell swap.
    this.dismissAllOverlays();

    // Both directions sweep non-active tabs:
    //   MDI → SDI: spec calls for "Aktif tab SDI view'ı olmaya devam eder.
    //              Diğer tab'lar kapatılmış sayılır."
    //   SDI → MDI: TabManager may have accumulated multiple SDI tabs (each
    //              navigate adds one); spec says the current active view
    //              becomes a single MDI tab, so non-active SDI tabs go too.
    // History entries are marked `closed: true` (kept, not deleted) inside
    // closeTabInternal via history.markClosedByTabKey.
    const active = this.tabs.getActiveTab();
    const sweepTargets = this.tabs
      .listTabs()
      .filter((t) => !active || t.tabKey !== active.tabKey)
      .map((t) => t.tabKey);
    this.logger.debug('setShellMode-sweep', undefined, {
      activeTabKey: active?.tabKey ?? null,
      sweptTabKeys: sweepTargets,
      sweepCount: sweepTargets.length,
    });
    for (const t of [...this.tabs.listTabs()]) {
      if (active && t.tabKey === active.tabKey) continue;
      await this.closeTabInternal(t.tabKey);
    }

    this.shellMode = mode;
    this.sigShellModeChanged.emit(mode);
    this.logger.debug('setShellMode-done', undefined, { mode });

    // Spec invariant: in MDI mode, a configured homepage is always represented
    // as a pinned, locked tab. The sweep above may have closed the previous
    // homepage tab (if it wasn't the active one), so when we re-enter MDI we
    // re-materialise the homepage tab from the surviving config. This is a
    // no-op when homepage is `null` (e.g. fresh boot, or post-logout where
    // the host explicitly cleared it before flipping to SDI), so the existing
    // login/logout flows are unaffected.
    //
    // Two paths:
    //   (a) The active SDI view already matches the homepage identity →
    //       just re-bind in place. No `runNavigate`, no surface re-create,
    //       no focus change. This matters because most homepage routes
    //       declare `restoreMode: 'refresh'` (the default), which would
    //       otherwise dispose + recreate the perfectly good surface that
    //       the user is staring at right now.
    //   (b) Active view is something else → fall through to a normal
    //       navigate, which honours singleton/lifetime/restoreMode rules
    //       and lands the user on the homepage (sibling SDI tab stays
    //       open, so context isn't lost).
    if (mode === ShellMode.mdi && this.homepage !== null) {
      const hp = this.homepage;
      this.logger.debug('setShellMode-restore-homepage', undefined, { homepage: hp });
      const route = this.findRoute(hp.routeKey);
      if (route) {
        const resolved = resolveRoutePayload(route.inputs, hp.extraData, {
          routeKey: route.key,
          logger: this.logger,
        });
        if (resolved.ok) {
          const match = findSingletonMatch(
            this.tabs.listTabs(),
            {
              routeKey: route.key,
              singletonKey: route.singletonKey ?? [],
              payload: resolved.payload,
            },
            { logger: this.logger },
          );
          if (match) {
            this.bindHomepageTab(match.tabKey);
          } else {
            const result = await this.runNavigate({
              routeKey: hp.routeKey,
              ...(hp.extraData !== undefined ? { extraData: hp.extraData } : {}),
            });
            if (result.outcome === 'completed' && result.tabKey) {
              this.bindHomepageTab(result.tabKey);
            }
          }
        } else {
          this.logger.warn('setShellMode-restore-homepage-payload-invalid', undefined, {
            routeKey: hp.routeKey,
          });
        }
      } else {
        this.logger.warn('setShellMode-restore-homepage-route-missing', undefined, {
          routeKey: hp.routeKey,
        });
      }
    }

    return this.syntheticCompleted();
  }

  setLocale(locale: string): void {
    this.logger.debug('setLocale-enter', undefined, {
      from: this.locale,
      to: locale,
    });
    if (locale === this.locale) {
      // Self-healing emit; see setShellMode/setHomepage no-op rationale.
      this.logger.debug('setLocale-noop-same-locale');
      this.sigLocaleChanged.emit(locale);
      return;
    }
    this.locale = locale;
    this.logger.info('locale-changed', undefined, { locale });

    // Re-resolve NavigationItem snapshots for tabs / overlays / history. The
    // payload + resolvedData are kept as-is (spec: "locale değişimi yeni data
    // fetch tetiklemez"); we just rebuild title/subtitle with the new locale
    // string. Routes no longer present in the registry are skipped + warned.
    const rebuild = (
      currentItem: NavigationItem,
      payload: Record<string, unknown>,
    ): NavigationItem | null => {
      const route = this.findRoute(currentItem.key);
      if (!route) {
        this.logger.warn('route-not-found-on-locale-change', undefined, {
          routeKey: currentItem.key,
        });
        return null;
      }
      return buildNavigationItem({
        route,
        payload,
        resolvedData: currentItem.resolvedData,
        locale: this.locale,
        ...(this.fallbackLocale !== undefined ? { fallbackLocale: this.fallbackLocale } : {}),
        defaultLifetime: this.defaultLifetime,
        logger: this.logger,
      });
    };

    let tabRebuilds = 0;
    let overlayRebuilds = 0;
    for (const t of this.tabs.listTabs()) {
      const next = rebuild(t.item, t.payload);
      if (next) {
        this.tabs.replaceItem(t.tabKey, next);
        tabRebuilds++;
      }
    }
    for (const o of this.overlays.getStack()) {
      const next = rebuild(o.item, o.payload);
      if (next) {
        this.overlays.replaceItem(o.overlayKey, next);
        overlayRebuilds++;
      }
    }
    this.history.replaceItems((e) => rebuild(e.item, e.payload));

    this.logger.debug('setLocale-rebuilt', undefined, {
      tabRebuilds,
      overlayRebuilds,
      historyEntries: this.history.getEntries().length,
    });

    this.sigLocaleChanged.emit(locale);
    this.sigHistoryChanged.emit(this.history.getEntries());
  }

  async setHomepage(
    config: HomepageConfig | null,
    options?: { navigate?: boolean },
  ): Promise<NavigateResult> {
    const navigate = options?.navigate ?? true;
    const prev = this.homepage;
    this.logger.debug('setHomepage-enter', undefined, {
      prev,
      next: config,
      navigate,
    });

    // Case A — clear homepage. Tab (if any) is unlocked but stays open per
    // spec: "Tab kapatılmaz; sadece lock düşer."
    if (config === null) {
      if (prev === null) {
        // Self-healing: re-emit so external observers can re-pull the
        // null homepage even if they previously desynced. Same rationale
        // as `setShellMode-noop` — idempotent in steady-state Vue refs,
        // corrective for any consumer that drifted.
        this.logger.debug('setHomepage-noop-already-null');
        this.sigHomepageChanged.emit(null);
        return this.syntheticCompleted();
      }
      if (this.homepageTabKey) {
        const t = this.tabs.findByKey(this.homepageTabKey);
        if (t) {
          this.tabs.unpinTab(this.homepageTabKey);
          this.sigTabUnpinned.emit(t);
        }
      }
      this.homepage = null;
      this.homepageTabKey = null;
      this.sigHomepageChanged.emit(null);
      return this.syntheticCompleted();
    }

    // Validate the new route exists in the registry early so we never tear
    // down the old homepage on an obviously broken target.
    if (!this.findRoute(config.routeKey)) {
      this.logger.warn('route-not-found', undefined, { routeKey: config.routeKey });
      return { outcome: 'cancelled', reason: 'route-not-found' };
    }

    // Case B — same identity. Re-emit not fired; just activate (when
    // `navigate: true`) so the route's restoreMode runs naturally.
    if (prev !== null && this.homepageConfigEqual(prev, config)) {
      this.logger.debug('setHomepage-same-identity', undefined, { config });
      if (!navigate) {
        return this.syntheticCompleted();
      }
      const result = await this.runNavigate({
        routeKey: config.routeKey,
        ...(config.extraData !== undefined ? { extraData: config.extraData } : {}),
      });
      if (result.outcome === 'completed' && result.tabKey) {
        this.bindHomepageTab(result.tabKey);
      }
      return result;
    }

    // Case C — different identity. Swap flow.
    if (prev !== null && this.homepageTabKey) {
      this.logger.debug('setHomepage-swap', undefined, {
        prev,
        next: config,
        oldTabKey: this.homepageTabKey,
      });
      const oldKey = this.homepageTabKey;
      // Spec: "(1) eski homepage tab için isClosable = true, isPinned = false."
      const oldTab = this.tabs.findByKey(oldKey);
      if (oldTab) {
        this.tabs.unpinTab(oldKey);
        this.sigTabUnpinned.emit(oldTab);
      }
      // (2) closeTab(oldTabKey). beforeNavigate-guard wiring lands with the
      // back/forward slice; for now the close is unconditional.
      this.homepageTabKey = null;
      await this.closeTabInternal(oldKey);
    }

    this.homepage = config;

    if (navigate) {
      const result = await this.runNavigate({
        routeKey: config.routeKey,
        ...(config.extraData !== undefined ? { extraData: config.extraData } : {}),
      });
      if (result.outcome === 'completed' && result.tabKey) {
        this.bindHomepageTab(result.tabKey);
      }
      this.sigHomepageChanged.emit(config);
      return result;
    }

    // navigate: false — adopt any tab that already matches the new identity.
    const adopt = this.tabs
      .listTabs()
      .find((t) => t.item.key === config.routeKey);
    if (adopt) this.bindHomepageTab(adopt.tabKey);
    this.sigHomepageChanged.emit(config);
    return this.syntheticCompleted();
  }

  async goHome(): Promise<NavigateResult> {
    this.logger.debug('goHome-enter', undefined, {
      homepage: this.homepage,
      homepageTabKey: this.homepageTabKey,
    });
    if (this.homepage === null) {
      this.logger.warn('no-homepage-set');
      return { outcome: 'failed', error: new Error('no-homepage-set') };
    }
    const result = await this.runNavigate({
      routeKey: this.homepage.routeKey,
      ...(this.homepage.extraData !== undefined
        ? { extraData: this.homepage.extraData }
        : {}),
    });
    // Re-bind in case the tab was just (re)created — the navigate pipeline
    // doesn't know about homepage state on its own.
    if (result.outcome === 'completed' && result.tabKey) {
      this.bindHomepageTab(result.tabKey);
    }
    return result;
  }

  /**
   * Bring an existing tab to the front and apply its route's `restoreMode`.
   *
   * - `preserve` → fast-path: dismiss overlays, activate, push history,
   *   emit `onTabActivated`. Surface and content layer state untouched.
   * - `refresh` (default) → dispose existing surface, run `onEvaluate` for
   *   fresh data, create a new surface in place (same `tabKey`), then
   *   activate + history.
   *
   * Unknown `tabKey` → `cancelled + 'tab-not-found'`.
   */
  async activateTab(tabKey: string): Promise<NavigateResult> {
    this.logger.debug('activateTab-enter', undefined, { tabKey });
    const existing = this.tabs.findByKey(tabKey);
    if (!existing) {
      this.logger.warn('tab-not-found', undefined, { tabKey });
      return { outcome: 'cancelled', reason: 'tab-not-found' };
    }

    const route = this.findRoute(existing.item.key);
    const restoreMode = route?.restoreMode ?? 'refresh';
    this.logger.debug('activateTab-branch', undefined, {
      tabKey,
      routeKey: existing.item.key,
      restoreMode,
    });

    // PRESERVE — pure activation, no surface churn.
    if (restoreMode === 'preserve') {
      this.dismissAllOverlays();
      const activated = this.tabs.activateTab(tabKey);
      this.sigTabActivated.emit(activated.activated);
      this.history.push({
        at: new Date().toISOString(),
        shellMode: this.shellMode,
        tabKey,
        item: existing.item,
        payload: existing.payload,
      });
      this.sigHistoryChanged.emit(this.history.getEntries());
      return {
        outcome: 'completed',
        resolvedItems: [existing.item],
        payload: existing.payload,
        presentation: 'surface',
        tabKey,
      };
    }

    // REFRESH — dispose, re-evaluate, recreate surface in place.
    if (this.disposeViewSurface) {
      try {
        await this.disposeViewSurface(existing.surface);
      } catch (err) {
        this.logger.warn('dispose-view-surface-threw', undefined, {
          tabKey,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let resolvedItems: NavigationItem[];
    try {
      resolvedItems = await this.onEvaluate({
        item: existing.item,
        payload: existing.payload,
      });
    } catch (err) {
      this.logger.error('on-evaluate-failed', err, {
        routeKey: existing.item.key,
        tabKey,
      });
      return { outcome: 'failed', error: err };
    }
    const evaluatedItem = resolvedItems[0] ?? existing.item;

    let surface: ViewSurface;
    try {
      surface = await this.createViewSurface({
        handleKey: tabKey,
        item: evaluatedItem,
        presentation: 'surface',
      });
    } catch (err) {
      this.logger.error('create-view-surface-failed', err, {
        routeKey: existing.item.key,
        tabKey,
      });
      return { outcome: 'failed', error: err };
    }

    this.tabs.refreshTab(tabKey, {
      item: evaluatedItem,
      payload: existing.payload,
      surface,
    });
    this.dismissAllOverlays();
    const activated = this.tabs.activateTab(tabKey);
    this.sigTabActivated.emit(activated.activated);
    this.history.push({
      at: new Date().toISOString(),
      shellMode: this.shellMode,
      tabKey,
      item: evaluatedItem,
      payload: existing.payload,
    });
    this.sigHistoryChanged.emit(this.history.getEntries());

    return {
      outcome: 'completed',
      resolvedItems: [evaluatedItem],
      payload: existing.payload,
      presentation: 'surface',
      tabKey,
    };
  }

  async closeTab(tabKey: string): Promise<void> {
    this.logger.debug('closeTab-enter', undefined, { tabKey });
    if (this.isHomepageLocked(tabKey)) {
      this.logger.warn('homepage-not-closable', undefined, { tabKey });
      return;
    }
    await this.closeTabInternal(tabKey);
  }

  /**
   * Dismiss a specific overlay by key. Disposes its surface and fires
   * `onOverlayClosed`. Unknown `overlayKey` is a warn + no-op.
   */
  async closeOverlay(overlayKey: string): Promise<void> {
    this.logger.debug('closeOverlay-enter', undefined, { overlayKey });
    const target = this.overlays.findByKey(overlayKey);
    if (!target) {
      this.logger.warn('overlay-not-found', undefined, { overlayKey });
      return;
    }
    const popped = this.overlays.dismissByKey(overlayKey);
    if (popped && this.disposeViewSurface) {
      try {
        await this.disposeViewSurface(popped.surface);
      } catch (err) {
        this.logger.warn('dispose-view-surface-threw', undefined, {
          overlayKey,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (popped) {
      this.sigOverlayClosed.emit(popped.overlayKey);
      this.logger.debug('overlay-closed', undefined, { overlayKey });
    }
  }

  /**
   * Dismiss the topmost overlay (if any). Convenience wrapper used by hosts
   * for backdrop / ESC handlers — no-op when the stack is empty.
   */
  async dismissTopOverlay(): Promise<void> {
    this.logger.debug('dismissTopOverlay-enter');
    const top = this.overlays.getTop();
    if (!top) {
      this.logger.debug('no-overlay-to-dismiss');
      return;
    }
    await this.closeOverlay(top.overlayKey);
  }

  async goBack(): Promise<NavigateResult> {
    this.logger.debug('goBack-enter', undefined, {
      overlayCount: this.overlays.getStack().length,
      canGoBack: this.history.canGoBack(),
    });
    // 1. Open overlay → top-dismiss (history pointer untouched). Spec:
    // "goBack() açık overlay olarak top overlay kapatılır … cancelled +
    // 'overlay-dismissed-instead'."
    const top = this.overlays.getTop();
    if (top) {
      const popped = this.overlays.dismissByKey(top.overlayKey);
      if (popped && this.disposeViewSurface) {
        try {
          await this.disposeViewSurface(popped.surface);
        } catch (err) {
          this.logger.warn('dispose-view-surface-threw', undefined, {
            overlayKey: popped.overlayKey,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (popped) this.sigOverlayClosed.emit(popped.overlayKey);
      this.logger.info('overlay-dismissed-instead');
      return { outcome: 'cancelled', reason: 'overlay-dismissed-instead' };
    }

    // 2. Boundary check → 'history-bound'.
    if (!this.history.canGoBack()) {
      this.logger.debug('history-bound');
      return { outcome: 'cancelled', reason: 'history-bound' };
    }

    // 3. Move cursor + replay through the navigate pipeline with
    //    `source: 'history'` and `skipHistoryPush` so we don't push a fresh
    //    entry for the back step.
    const target = this.history.back();
    if (!target) {
      this.logger.debug('history-bound');
      return { outcome: 'cancelled', reason: 'history-bound' };
    }
    this.sigHistoryChanged.emit(this.history.getEntries());
    return this.runNavigate(
      {
        routeKey: target.item.key,
        ...(Object.keys(target.payload).length > 0 ? { extraData: target.payload } : {}),
      },
      { source: 'history', skipHistoryPush: true },
    );
  }

  async goForward(): Promise<NavigateResult> {
    this.logger.debug('goForward-enter', undefined, {
      canGoForward: this.history.canGoForward(),
    });
    // Overlay stack does not interact with goForward (overlays don't enter
    // history → there's no overlay to "forward into").
    if (!this.history.canGoForward()) {
      this.logger.debug('history-bound');
      return { outcome: 'cancelled', reason: 'history-bound' };
    }
    const target = this.history.forward();
    if (!target) {
      this.logger.debug('history-bound');
      return { outcome: 'cancelled', reason: 'history-bound' };
    }
    this.sigHistoryChanged.emit(this.history.getEntries());
    return this.runNavigate(
      {
        routeKey: target.item.key,
        ...(Object.keys(target.payload).length > 0 ? { extraData: target.payload } : {}),
      },
      { source: 'history', skipHistoryPush: true },
    );
  }

  // pinTab/unpinTab/markTabDirty are simple pass-throughs once the homepage
  // lock check is added; for now we route directly to TabManager so smoke
  // tests can exercise the simple flow without the navigate pipeline.
  pinTab(tabKey: string): void {
    if (this.isHomepageLocked(tabKey)) {
      this.logger.info('homepage-pin-locked', undefined, { tabKey });
      return;
    }
    const target = this.tabs.findByKey(tabKey);
    if (!target) {
      this.logger.warn('tab-not-found', undefined, { tabKey });
      return;
    }
    this.tabs.pinTab(tabKey);
    const tab = this.tabs.findByKey(tabKey);
    if (tab) this.sigTabPinned.emit(tab);
  }

  unpinTab(tabKey: string): void {
    if (this.isHomepageLocked(tabKey)) {
      this.logger.info('homepage-pin-locked', undefined, { tabKey });
      return;
    }
    const target = this.tabs.findByKey(tabKey);
    if (!target) {
      this.logger.warn('tab-not-found', undefined, { tabKey });
      return;
    }
    this.tabs.unpinTab(tabKey);
    const tab = this.tabs.findByKey(tabKey);
    if (tab) this.sigTabUnpinned.emit(tab);
  }

  markTabDirty(tabKey: string, dirty: boolean): void {
    const target = this.tabs.findByKey(tabKey);
    if (!target) {
      this.logger.warn('tab-not-found', undefined, { tabKey });
      return;
    }
    if (target.isDirty === dirty) return;
    this.tabs.setDirty(tabKey, dirty);
    const updated = this.tabs.findByKey(tabKey);
    if (updated) {
      this.logger.debug('markTabDirty', undefined, { tabKey, dirty });
      this.sigTabDirtyChanged.emit(updated);
    }
  }

  clearHistory(): void {
    this.history.clear();
    // Overlay symmetry per spec — full surface dispose lives in the navigate
    // slice; for now we just empty the stack and notify.
    const popped = this.overlays.clear();
    for (const o of popped) {
      this.sigOverlayClosed.emit(o.overlayKey);
    }
    this.sigHistoryChanged.emit(this.history.getEntries());
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  onBeforeNavigate(handler: BeforeNavigateHandler): Subscription {
    this.beforeNavigateHandlers.push(handler);
    return {
      unsubscribe: () => {
        const i = this.beforeNavigateHandlers.indexOf(handler);
        if (i >= 0) this.beforeNavigateHandlers.splice(i, 1);
      },
    };
  }

  onAfterNavigate(handler: AfterNavigateHandler): Subscription {
    this.afterNavigateHandlers.push(handler);
    return {
      unsubscribe: () => {
        const i = this.afterNavigateHandlers.indexOf(handler);
        if (i >= 0) this.afterNavigateHandlers.splice(i, 1);
      },
    };
  }

  onTabOpened(handler: (tab: OpenTab) => void): Subscription {
    return this.sigTabOpened.subscribe(handler);
  }

  onTabClosed(handler: (tabKey: string) => void): Subscription {
    return this.sigTabClosed.subscribe(handler);
  }

  onTabActivated(handler: (tab: OpenTab) => void): Subscription {
    return this.sigTabActivated.subscribe(handler);
  }

  onTabPinned(handler: (tab: OpenTab) => void): Subscription {
    return this.sigTabPinned.subscribe(handler);
  }

  onTabUnpinned(handler: (tab: OpenTab) => void): Subscription {
    return this.sigTabUnpinned.subscribe(handler);
  }

  onTabDirtyChanged(handler: (tab: OpenTab) => void): Subscription {
    return this.sigTabDirtyChanged.subscribe(handler);
  }

  onShellModeChanged(handler: (mode: ShellMode) => void): Subscription {
    return this.sigShellModeChanged.subscribe(handler);
  }

  onOverlayOpened(handler: (overlay: OpenOverlay) => void): Subscription {
    return this.sigOverlayOpened.subscribe(handler);
  }

  onOverlayClosed(handler: (overlayKey: string) => void): Subscription {
    return this.sigOverlayClosed.subscribe(handler);
  }

  onHomepageChanged(
    handler: (config: HomepageConfig | null) => void,
  ): Subscription {
    return this.sigHomepageChanged.subscribe(handler);
  }

  onHistoryChanged(
    handler: (history: ReadonlyArray<HistoryEntry>) => void,
  ): Subscription {
    return this.sigHistoryChanged.subscribe(handler);
  }

  onLocaleChanged(handler: (locale: string) => void): Subscription {
    return this.sigLocaleChanged.subscribe(handler);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers (subset; more arrive with later slices)
  // ---------------------------------------------------------------------------

  private isHomepageLocked(tabKey: string): boolean {
    return this.homepageTabKey === tabKey;
  }

  /**
   * Marks `tabKey` as the homepage-bound tab: pins + locks against close,
   * and parks it at index 0 of the tabstrip. The leftmost-slot rule matches
   * the universal browser/IDE convention for pinned tabs and means hosts
   * never need a "where do I render the homepage?" decision — it is always
   * the first entry in `getOpenTabs()`. Idempotent: safe to call after every
   * successful homepage navigate / re-bind.
   */
  private bindHomepageTab(tabKey: string): void {
    this.homepageTabKey = tabKey;
    this.tabs.pinTab(tabKey);
    this.tabs.moveTabToIndex(tabKey, 0);
    const t = this.tabs.findByKey(tabKey);
    if (t) this.sigTabPinned.emit(t);
  }

  /**
   * Strict equality on `(routeKey, extraData)`. `extraData` comparison uses a
   * stable JSON dump — sufficient for primitive-only homepage payloads (spec
   * recommends primitives, mirroring singletonKey).
   */
  private homepageConfigEqual(a: HomepageConfig, b: HomepageConfig): boolean {
    if (a.routeKey !== b.routeKey) return false;
    const ax = a.extraData ?? {};
    const bx = b.extraData ?? {};
    try {
      return JSON.stringify(ax) === JSON.stringify(bx);
    } catch {
      // Cyclic / unstringifiable payloads: fall back to reference equality.
      return ax === bx;
    }
  }

  /** Synthesises a "no-op" completed result for state-only homepage paths. */
  private syntheticCompleted(): NavigateResult {
    return {
      outcome: 'completed',
      resolvedItems: [],
      payload: {},
      presentation: 'surface',
    };
  }

  /**
   * Internal tab close — bypasses the homepage-lock check (used by the
   * homepage swap flow) and disposes the surface + history bookkeeping.
   * Returns whether the tab was actually removed.
   */
  private async closeTabInternal(tabKey: string): Promise<boolean> {
    const target = this.tabs.findByKey(tabKey);
    if (!target) {
      this.logger.warn('tab-not-found', undefined, { tabKey });
      return false;
    }
    // Force closable so TabManager actually pops it.
    this.tabs.setClosable(tabKey, true);
    const close = this.tabs.closeTab(tabKey);
    if (!close.ok) {
      this.logger.warn('tab-close-failed', undefined, { tabKey, reason: close.reason });
      return false;
    }
    if (this.disposeViewSurface && close.closed) {
      try {
        await this.disposeViewSurface(close.closed.surface);
      } catch (err) {
        this.logger.warn('dispose-view-surface-threw', undefined, {
          tabKey,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.history.markClosedByTabKey(tabKey);
    if (this.homepageTabKey === tabKey) {
      // Spec (Homepage edge case): "shell-mode sweep" closes the homepage
      // tab without firing onHomepageChanged. State stays for a future
      // re-bind; the tab reference does not.
      this.homepageTabKey = null;
    }
    this.sigTabClosed.emit(tabKey);
    if (close.nextActive) this.sigTabActivated.emit(close.nextActive);
    this.sigHistoryChanged.emit(this.history.getEntries());
    return true;
  }

  // ===========================================================================
  // navigate() pipeline
  // ===========================================================================

  /**
   * Single-entry navigate pipeline (spec → "Akış (Özet)").
   *
   * Steps run in this fixed order; each step has an explicit "early-out"
   * branch (so we never partially mutate state):
   *
   *  1. Resolve `RouteDefinition` from `request.routeDefinition` or
   *     `registry.findRoute(request.routeKey)`. Missing → cancelled
   *     `route-not-found` (no `onEvaluate`, no `beforeNavigate`).
   *  2. `resolveRoutePayload` over `RouteInput` contract. Missing-required →
   *     cancelled `missing-required-input` (still no side-effects).
   *  3. `buildNavigationItem` with current `(locale, fallbackLocale)`.
   *  4. Compose `NavigateContext`.
   *  5. Run `beforeNavigate` chain sequentially. First `{cancel:true}` →
   *     cancelled with that reason. Handler exceptions are isolated (logged
   *     `beforeNavigate-handler-threw`) and treated as non-cancelling.
   *  6. `onEvaluate({ item, payload })` → expects `NavigationItem[]`.
   *     Empty array → cancelled `empty-evaluation`. Throw → failed.
   *  7. `createViewSurface({ handleKey, item, presentation })`. Throw →
   *     failed (no tab/history mutation).
   *  8. State mutation: tab open + activate (surface) or overlay push;
   *     history push (surface only); related signals fire.
   *  9. `onNavigate(ctx, surface)` — host content-layer hook. Exceptions
   *     are logged but do NOT change the navigate outcome (the tab is open).
   * 10. Run `afterNavigate` chain (best-effort, parallel-await with isolated
   *     handler errors).
   *
   * Phase-1 simplifications (filled in by later slices):
   *
   * - Identity / fast-path matching is done **only** for `singleton + surface`
   *   open-tabs (preserve / refresh distinction); overlay-singleton matching
   *   and the SDI shell-mode swap arrive with `core-shell` / `core-overlay`.
   * - `request.source: 'history' | 'shellSwitch'` SDK-internal override warn
   *   is wired here; full `goBack` / `setShellMode` integration arrives in
   *   their respective slices.
   */
  private async runNavigate(
    request: NavigateRequest,
    internal?: { source?: NavigateSource; skipHistoryPush?: boolean },
  ): Promise<NavigateResult> {
    this.logger.debug('navigate-enter', undefined, {
      routeKey: request.routeKey,
      hasRouteDefinition: !!request.routeDefinition,
      requestedSource: request.source,
      internalSource: internal?.source,
      skipHistoryPush: internal?.skipHistoryPush ?? false,
      lifetimeOverride: request.lifetime,
      presentationOverride: request.presentation,
      restoreModeOverride: request.restoreMode,
      extraData: request.extraData,
    });

    // 1. Source derivation. Internal-only sources ('history' | 'shellSwitch')
    // are not part of the public NavigateRequest type, but defensive runtime
    // scrubbing protects against hosts casting through `any`. Trusted internal
    // callers (goBack/goForward/setShellMode autoSwitch) pass `internal.source`
    // to bypass the warn + override.
    let source: NavigateSource;
    if (internal?.source) {
      source = internal.source;
    } else {
      const requested = request.source as NavigateSource | undefined;
      if (requested === 'history' || requested === 'shellSwitch') {
        this.logger.warn('source-internal-override', undefined, {
          attempted: requested,
        });
        source = request.routeDefinition ? 'routeDefinition' : 'routeKey';
      } else if (requested) {
        source = requested;
      } else {
        source = request.routeDefinition ? 'routeDefinition' : 'routeKey';
      }
    }

    // 2. Resolve route definition.
    const route =
      request.routeDefinition ??
      (request.routeKey ? this.findRoute(request.routeKey) : null);
    if (!route) {
      this.logger.warn('route-not-found', undefined, { routeKey: request.routeKey });
      return { outcome: 'cancelled', reason: 'route-not-found' };
    }
    this.logger.debug('navigate-route-resolved', undefined, {
      routeKey: route.key,
      lifetime: route.lifetime,
      presentation: route.presentation ?? 'surface',
      restoreMode: route.restoreMode ?? 'refresh',
      singletonKey: route.singletonKey ?? [],
      hasInputs: (route.inputs?.length ?? 0) > 0,
    });

    // 3. Payload merge.
    const resolved = resolveRoutePayload(route.inputs, request.extraData, {
      routeKey: route.key,
      logger: this.logger,
    });
    if (!resolved.ok) {
      return { outcome: 'cancelled', reason: resolved.reason };
    }
    const { payload, resolvedData } = resolved;

    // 4. NavigationItem (locale-resolved + interpolated title/subtitle).
    const item = buildNavigationItem({
      route,
      payload,
      resolvedData,
      locale: this.locale,
      ...(this.fallbackLocale !== undefined ? { fallbackLocale: this.fallbackLocale } : {}),
      defaultLifetime: this.defaultLifetime,
      logger: this.logger,
    });

    const presentation: PresentationMode =
      request.presentation ?? route.presentation ?? 'surface';
    const requestedRestoreMode: RestoreMode =
      request.restoreMode ?? route.restoreMode ?? 'refresh';
    const lifetime = request.lifetime ?? route.lifetime ?? this.defaultLifetime;

    // 5. Identity computation (singleton).
    //    `findSingletonMatch` handles missing-value / non-primitive warns and
    //    returns null for transient fallback.
    let existingTab: OpenTab | null = null;
    let existingOverlay: OpenOverlay | null = null;
    if (lifetime === RouteLifetime.singleton) {
      if (presentation === 'surface' && this.shellMode === ShellMode.mdi) {
        existingTab = findSingletonMatch(
          this.tabs.listTabs(),
          { routeKey: route.key, singletonKey: route.singletonKey ?? [], payload },
          { logger: this.logger },
        );
      } else if (presentation === 'overlay') {
        existingOverlay = findSingletonMatch(
          this.overlays.getStack(),
          { routeKey: route.key, singletonKey: route.singletonKey ?? [], payload },
          { logger: this.logger },
        );
      }
    } else if (
      lifetime === RouteLifetime.transient &&
      route.singletonKey &&
      route.singletonKey.length > 0
    ) {
      this.logger.warn('singleton-key-ignored-on-transient', undefined, {
        routeKey: route.key,
      });
    }

    // SDI cannot honour `preserve` (no surface cache). Fall back to refresh
    // with an info-level log so the host knows the route's preference was
    // overridden by the active shell mode.
    let restoreMode: RestoreMode = requestedRestoreMode;
    if (
      requestedRestoreMode === 'preserve' &&
      this.shellMode === ShellMode.sdi &&
      presentation === 'surface'
    ) {
      this.logger.info('sdi-preserve-not-applicable', undefined, {
        routeKey: route.key,
      });
      restoreMode = 'refresh';
    }

    const isSurfaceSingletonHit =
      existingTab !== null && presentation === 'surface' && lifetime === RouteLifetime.singleton;
    const isOverlaySingletonHit =
      existingOverlay !== null && presentation === 'overlay' && lifetime === RouteLifetime.singleton;
    const isFastPathSurface = isSurfaceSingletonHit && restoreMode === 'preserve';
    const isRefreshSurface = isSurfaceSingletonHit && restoreMode === 'refresh';
    const isFastPathOverlay = isOverlaySingletonHit && restoreMode === 'preserve';
    const isRefreshOverlay = isOverlaySingletonHit && restoreMode === 'refresh';

    const branch = isFastPathSurface
      ? 'fast-path-surface'
      : isRefreshSurface
        ? 'refresh-surface'
        : isFastPathOverlay
          ? 'fast-path-overlay'
          : isRefreshOverlay
            ? 'refresh-overlay'
            : presentation === 'overlay'
              ? 'fresh-overlay'
              : 'fresh-surface';
    this.logger.debug('navigate-branch', undefined, {
      routeKey: route.key,
      branch,
      presentation,
      lifetime,
      restoreMode,
      shellMode: this.shellMode,
      existingTabKey: existingTab?.tabKey ?? null,
      existingOverlayKey: existingOverlay?.overlayKey ?? null,
      payload,
    });

    // 5b. Context. Fast-path uses the *existing* tab/overlay snapshot
    //     (spec: state preservation). All other paths use the freshly built
    //     payload + item.
    const currentTab = this.tabs.getActiveTab();
    const ctx: NavigateContext =
      isFastPathSurface && existingTab
        ? {
            resolvedItems: [existingTab.item],
            payload: existingTab.payload,
            shellMode: this.shellMode,
            lifetime,
            presentation,
            restoreMode,
            source,
            tabKey: existingTab.tabKey,
          }
        : isFastPathOverlay && existingOverlay
          ? {
              resolvedItems: [existingOverlay.item],
              payload: existingOverlay.payload,
              shellMode: this.shellMode,
              lifetime,
              presentation,
              restoreMode,
              source,
              overlayKey: existingOverlay.overlayKey,
              ...(existingOverlay.underlayTabKey !== undefined
                ? { tabKey: existingOverlay.underlayTabKey }
                : {}),
            }
          : {
              resolvedItems: [item],
              payload,
              shellMode: this.shellMode,
              lifetime,
              presentation,
              restoreMode,
              source,
              ...(isRefreshSurface && existingTab
                ? { tabKey: existingTab.tabKey }
                : {}),
              ...(isRefreshOverlay && existingOverlay
                ? { overlayKey: existingOverlay.overlayKey }
                : {}),
              ...(currentTab && presentation === 'overlay'
                ? { tabKey: currentTab.tabKey }
                : {}),
            };

    // 6. beforeNavigate chain — sequential, cancel-aware.
    const guard = await this.runBeforeNavigateChain(ctx);
    if (guard.cancelled) {
      const result: NavigateResult = {
        outcome: 'cancelled',
        ...(guard.reason !== undefined ? { reason: guard.reason } : {}),
      };
      await this.runAfterNavigateChain(
        ctx,
        'cancelled',
        guard.reason !== undefined ? { reason: guard.reason } : {},
      );
      return result;
    }

    // 6b. SURFACE FAST-PATH: surface + MDI + singleton + identity-match +
    //     preserve. No onEvaluate, no createViewSurface; just activate +
    //     history. Surface and content layer (form state, scroll, workflow
    //     step) are preserved as-is. Open overlays auto-dismiss on focus
    //     shift.
    if (isFastPathSurface && existingTab) {
      this.logger.debug('fast-path-surface-activate', undefined, {
        tabKey: existingTab.tabKey,
        routeKey: existingTab.item.key,
      });
      this.dismissAllOverlays();
      const activated = this.tabs.activateTab(existingTab.tabKey);
      this.sigTabActivated.emit(activated.activated);
      if (!internal?.skipHistoryPush) {
        this.history.push({
          at: new Date().toISOString(),
          shellMode: this.shellMode,
          tabKey: existingTab.tabKey,
          item: existingTab.item,
          payload: existingTab.payload,
        });
        this.sigHistoryChanged.emit(this.history.getEntries());
      }
      const result: NavigateResult = {
        outcome: 'completed',
        resolvedItems: [existingTab.item],
        payload: existingTab.payload,
        presentation: 'surface',
        tabKey: existingTab.tabKey,
      };
      this.logger.debug('navigate-completed', undefined, {
        branch: 'fast-path-surface',
        tabKey: existingTab.tabKey,
      });
      await this.runAfterNavigateChain(ctx, 'completed');
      return result;
    }

    // 6c. OVERLAY FAST-PATH: overlay + singleton + identity-match + preserve.
    //     The matched overlay is moved to the top of the stack; its surface
    //     and content stay untouched. No history entry (overlays don't write
    //     history). No `onOverlayActivated` event — host inspects stackIndex
    //     change via `onOverlayOpened` is **not** re-fired either; spec
    //     defers the activation hook to a follow-up slice.
    if (isFastPathOverlay && existingOverlay) {
      this.logger.debug('fast-path-overlay-moveToTop', undefined, {
        overlayKey: existingOverlay.overlayKey,
      });
      this.overlays.moveToTop(existingOverlay.overlayKey);
      const result: NavigateResult = {
        outcome: 'completed',
        resolvedItems: [existingOverlay.item],
        payload: existingOverlay.payload,
        presentation: 'overlay',
        overlayKey: existingOverlay.overlayKey,
      };
      this.logger.debug('navigate-completed', undefined, {
        branch: 'fast-path-overlay',
        overlayKey: existingOverlay.overlayKey,
      });
      await this.runAfterNavigateChain(ctx, 'completed');
      return result;
    }

    // 7. onEvaluate. (Skipped only on fast-path above.)
    this.logger.debug('onEvaluate-call', undefined, { routeKey: route.key });
    let resolvedItems: NavigationItem[];
    try {
      const out = await this.onEvaluate({ item, payload });
      resolvedItems = Array.isArray(out) ? out : [out];
    } catch (err) {
      this.logger.error('evaluate-failed', err, { routeKey: route.key });
      const result: NavigateResult = { outcome: 'failed', error: err };
      await this.runAfterNavigateChain(ctx, 'failed', { error: err });
      return result;
    }
    this.logger.debug('onEvaluate-result', undefined, {
      routeKey: route.key,
      itemCount: resolvedItems.length,
    });
    if (resolvedItems.length === 0) {
      this.logger.warn('empty-evaluation', undefined, { routeKey: route.key });
      const result: NavigateResult = {
        outcome: 'cancelled',
        reason: 'empty-evaluation',
      };
      await this.runAfterNavigateChain(ctx, 'cancelled', { reason: 'empty-evaluation' });
      return result;
    }
    const evaluatedItem = resolvedItems[0]!;
    ctx.resolvedItems = resolvedItems;

    // 8. createViewSurface. Refresh-on-existing reuses the existing
    //    tabKey/overlayKey as `handleKey` (host typically remounts the
    //    surface in place).
    const handleKey =
      isRefreshSurface && existingTab
        ? existingTab.tabKey
        : isRefreshOverlay && existingOverlay
          ? existingOverlay.overlayKey
          : presentation === 'overlay'
            ? this.mintOverlayKey(route.key)
            : this.mintTabKey(route.key);

    // Dispose the existing surface BEFORE creating the new one so the host
    // doesn't have to handle two surfaces sharing a handleKey simultaneously.
    const stalSurface =
      isRefreshSurface && existingTab
        ? existingTab.surface
        : isRefreshOverlay && existingOverlay
          ? existingOverlay.surface
          : null;
    if (stalSurface && this.disposeViewSurface) {
      this.logger.debug('dispose-stale-surface', undefined, {
        routeKey: route.key,
        handleKey,
      });
      try {
        await this.disposeViewSurface(stalSurface);
      } catch (err) {
        this.logger.warn('dispose-view-surface-threw', undefined, {
          routeKey: route.key,
          handleKey,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.debug('createViewSurface-call', undefined, {
      routeKey: route.key,
      handleKey,
      presentation,
    });
    let surface: ViewSurface;
    try {
      surface = await this.createViewSurface({
        handleKey,
        item: evaluatedItem,
        presentation,
      });
    } catch (err) {
      this.logger.error('create-view-surface-failed', err, {
        routeKey: route.key,
        handleKey,
      });
      const result: NavigateResult = { outcome: 'failed', error: err };
      await this.runAfterNavigateChain(ctx, 'failed', { error: err });
      return result;
    }
    this.logger.debug('createViewSurface-done', undefined, {
      routeKey: route.key,
      handleKey,
    });

    // 9. State mutation.
    let resultTabKey: string | undefined;
    let resultOverlayKey: string | undefined;
    if (presentation === 'surface') {
      if (isRefreshSurface && existingTab) {
        this.logger.debug('refresh-tab-in-place', undefined, {
          tabKey: handleKey,
          routeKey: route.key,
        });
        // Refresh in place: same tabKey, new item / payload / surface.
        this.tabs.refreshTab(handleKey, {
          item: evaluatedItem,
          payload,
          surface,
        });
        this.dismissAllOverlays();
        const activated = this.tabs.activateTab(handleKey);
        this.sigTabActivated.emit(activated.activated);
      } else {
        this.logger.debug('add-tab', undefined, {
          tabKey: handleKey,
          routeKey: route.key,
        });
        const tab = this.tabs.addTab({
          tabKey: handleKey,
          item: evaluatedItem,
          payload,
          surface,
        });
        this.sigTabOpened.emit(tab);
        this.dismissAllOverlays();
        const activated = this.tabs.activateTab(handleKey);
        this.sigTabActivated.emit(activated.activated);
      }
      if (!internal?.skipHistoryPush) {
        this.history.push({
          at: new Date().toISOString(),
          shellMode: this.shellMode,
          tabKey: handleKey,
          item: evaluatedItem,
          payload,
        });
        this.sigHistoryChanged.emit(this.history.getEntries());
      }
      resultTabKey = handleKey;
      ctx.tabKey = handleKey;
    } else {
      if (isRefreshOverlay && existingOverlay) {
        this.logger.debug('refresh-overlay-in-place', undefined, {
          overlayKey: handleKey,
          routeKey: route.key,
        });
        // Refresh in place: same overlayKey, new item / payload / surface.
        // Move to top so it's the active overlay.
        this.overlays.refreshOverlay(handleKey, {
          item: evaluatedItem,
          payload,
          surface,
        });
        this.overlays.moveToTop(handleKey);
      } else {
        this.logger.debug('push-overlay', undefined, {
          overlayKey: handleKey,
          routeKey: route.key,
          underlayTabKey: currentTab?.tabKey ?? null,
        });
        const overlay = this.overlays.push({
          overlayKey: handleKey,
          item: evaluatedItem,
          payload,
          surface,
          ...(currentTab ? { underlayTabKey: currentTab.tabKey } : {}),
        });
        this.sigOverlayOpened.emit(overlay);
      }
      resultOverlayKey = handleKey;
      ctx.overlayKey = handleKey;
    }

    // 10. Host hook (best-effort).
    this.logger.debug('onNavigate-call', undefined, {
      routeKey: route.key,
      handleKey,
    });
    try {
      await this.onNavigate(ctx, surface);
    } catch (err) {
      this.logger.error('onNavigate-threw', err, {
        routeKey: route.key,
        handleKey,
      });
    }

    const result: NavigateResult = {
      outcome: 'completed',
      resolvedItems,
      payload,
      presentation,
      ...(resultTabKey !== undefined ? { tabKey: resultTabKey } : {}),
      ...(resultOverlayKey !== undefined ? { overlayKey: resultOverlayKey } : {}),
    };
    void evaluatedItem;

    // 11. afterNavigate (best-effort, fire-and-forget allowed; we await so
    //     callers can sequence on it but errors don't propagate).
    await this.runAfterNavigateChain(ctx, 'completed');

    this.logger.debug('navigate-completed', undefined, {
      branch,
      ...(resultTabKey ? { tabKey: resultTabKey } : {}),
      ...(resultOverlayKey ? { overlayKey: resultOverlayKey } : {}),
    });
    return result;
  }

  /**
   * Spec: when a surface tab activates (fast-path or refresh) the overlay
   * stack is dismissed top→bottom because focus has shifted. Overlay-on-
   * overlay navigation does not call this. Errors are surfaced via warn but
   * never block the surrounding pipeline.
   */
  private dismissAllOverlays(): void {
    while (this.overlays.getTop()) {
      const popped = this.overlays.dismissTop();
      if (!popped) break;
      if (this.disposeViewSurface) {
        try {
          // Fire-and-forget; spec allows async dispose but we don't block
          // the activation step waiting for it.
          void this.disposeViewSurface(popped.surface);
        } catch (err) {
          this.logger.warn('dispose-view-surface-threw', undefined, {
            overlayKey: popped.overlayKey,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      this.sigOverlayClosed.emit(popped.overlayKey);
    }
  }

  private async runBeforeNavigateChain(
    ctx: NavigateContext,
  ): Promise<{ cancelled: false } | { cancelled: true; reason?: string }> {
    // Snapshot to allow handlers to mutate the subscription list mid-flight.
    for (const handler of [...this.beforeNavigateHandlers]) {
      try {
        const decision = await handler(ctx);
        if (decision && decision.cancel) {
          const out: { cancelled: true; reason?: string } = { cancelled: true };
          if (decision.reason !== undefined) out.reason = decision.reason;
          return out;
        }
      } catch (err) {
        this.logger.error('beforeNavigate-handler-threw', err, {
          routeKey: ctx.resolvedItems[0]?.key,
        });
      }
    }
    return { cancelled: false };
  }

  private async runAfterNavigateChain(
    ctx: NavigateContext,
    outcome: 'completed' | 'cancelled' | 'failed',
    extra: { error?: unknown; reason?: string } = {},
  ): Promise<void> {
    const payload = {
      ...ctx,
      outcome,
      ...(extra.error !== undefined ? { error: extra.error } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
    };
    const snapshot = [...this.afterNavigateHandlers];
    await Promise.all(
      snapshot.map(async (handler) => {
        try {
          await handler(payload);
        } catch (err) {
          this.logger.error('afterNavigate-handler-threw', err);
        }
      }),
    );
  }

  private mintTabKey(routeKey: string): string {
    let n = this.tabCounters.get(routeKey) ?? 0;
    let candidate: string;
    do {
      n += 1;
      candidate = `${routeKey}--${n}`;
    } while (this.tabs.findByKey(candidate) !== null);
    this.tabCounters.set(routeKey, n);
    return candidate;
  }

  private mintOverlayKey(routeKey: string): string {
    let n = this.overlayCounters.get(routeKey) ?? 0;
    let candidate: string;
    do {
      n += 1;
      candidate = `${routeKey}--ov-${n}`;
    } while (this.overlays.findByKey(candidate) !== null);
    this.overlayCounters.set(routeKey, n);
    return candidate;
  }
}

interface PageRouterCtorArgs {
  registry: RouteRegistry;
  options: PageRouterOptions;
  init: ResolvedInitConfig;
  logger: Logger;
}
