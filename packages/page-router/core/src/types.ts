import type {
  LogLevel,
  NavigateSource,
  PresentationMode,
  RestoreMode,
  RouteLifetime,
  ShellMode,
  ShellModeConflictPolicy,
} from './enums.js';

/**
 * Plain string (locale'e duyarsız) veya `locale → metin` haritası.
 * SDK locale key formatını yorumlamaz; eşleşme map lookup'ı üzerinden yapılır.
 */
export type LocalizedString = string | Record<string, string>;

/** Subscribe-tarzı API'lerin döndürdüğü kanca. */
export interface Subscription {
  unsubscribe(): void;
}

// ---------------------------------------------------------------------------
// Route definition / registry
// ---------------------------------------------------------------------------

export interface RouteInput {
  name: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface RouteDefinition {
  key: string;
  lifetime?: RouteLifetime;
  /**
   * `lifetime === 'singleton'` iken tab identity'sine dahil payload alan adları.
   * `inputs[].name` listesine referans verir. Boş / verilmediyse sadece
   * `routeKey` bazlı eşleşme yapılır.
   */
  singletonKey?: string[];
  /** Revisit davranışı. Default: `'refresh'`. */
  restoreMode?: RestoreMode;
  /** Sunum modu. Default: `'surface'`. */
  presentation?: PresentationMode;
  allowedShellModes?: ShellMode[];
  shellModeOnConflict?: ShellModeConflictPolicy;
  /** Opaque host metadata; SDK yorumlamaz, delegate'lere pass-through geçer. */
  config: Record<string, unknown>;
  /** Route'un beklediği parametre kontratı. */
  inputs?: RouteInput[];
  defaultTitle?: LocalizedString;
  defaultSubtitle?: LocalizedString;
}

/**
 * JSON'da taşınabilen init opsiyonları alt kümesi.
 * Delegate'ler (onEvaluate/onNavigate/createViewSurface/disposeViewSurface/onLog)
 * function olduğundan JSON'da taşınamaz; daima kod tarafından sağlanır.
 */
export interface RouteRegistryConfig {
  shellMode?: ShellMode;
  locale?: string;
  fallbackLocale?: string;
  defaultLifetime?: RouteLifetime;
  defaultShellModeOnConflict?: ShellModeConflictPolicy;
}

export interface RouteRegistry {
  /**
   * Opsiyonel; kod-tarafı `PageRouterOptions` ile birleştirilir.
   * Precedence: kod > JSON > SDK varsayılanı.
   */
  config?: RouteRegistryConfig;
  routes: RouteDefinition[];
}

// ---------------------------------------------------------------------------
// Navigation runtime types
// ---------------------------------------------------------------------------

/**
 * `evaluate` zincirinin SDK ↔ host arasında taşıdığı normalize edilmiş
 * navigation item. Title/subtitle locale ve `{{name}}` interpolasyonu
 * uygulanmış halde gelir; `resolvedData` her input için origin etiketini
 * (`extraData | default | missing`) içerir.
 */
export interface NavigationItem {
  key: string;
  lifetime: RouteLifetime;
  /** Opaque host metadata; route registry'den pass-through. */
  config: Record<string, unknown>;
  title?: string;
  subtitle?: string;
  resolvedData: Array<{
    name: string;
    value: unknown;
    origin: 'extraData' | 'default' | 'missing';
  }>;
  /** Bu item hangi locale ile resolve edildi (snapshot). */
  locale: string;
}

/**
 * Router ↔ Content Layer köprüsü. Host `createViewSurface` ile yaratır;
 * SDK tutar; host `disposeViewSurface` içinde cleanup yapar.
 *
 * `mount` opaque; TS'te tipik olarak `HTMLElement`, Dart'ta Widget/GlobalKey.
 * `handleKey`: surface navigasyonunda `tabKey`, overlay navigasyonunda `overlayKey`.
 */
export interface ViewSurface {
  readonly handleKey: string;
  readonly mount: unknown;
}

export interface OpenTab {
  tabKey: string;
  item: NavigationItem;
  payload: Record<string, unknown>;
  surface: ViewSurface;
  openedAt: string;
  lastActivatedAt: string;
  isActive: boolean;
  isDirty: boolean;
  isPinned: boolean;
  isClosable: boolean;
}

export interface OpenOverlay {
  overlayKey: string;
  item: NavigationItem;
  payload: Record<string, unknown>;
  surface: ViewSurface;
  openedAt: string;
  /** 0 = en dipteki; son index = top. */
  stackIndex: number;
  /** Overlay açıldığında aktif olan tab'ın key'i. SDI için `'sdi-root'`. */
  underlayTabKey?: string;
}

export interface ActiveViewSnapshot {
  /** Arka plandaki ana view. Hiç view yoksa null. */
  underlay: NavigationItem | null;
  /** Açık overlay'ler stackIndex sırasıyla. */
  overlays: ReadonlyArray<OpenOverlay>;
}

/**
 * Homepage identity'si. `RouteDefinition`'da flag DEĞİL — runtime'da
 * `setHomepage(...)` ile set edilir. Aynı `routeKey` farklı zamanlarda
 * homepage olabilir (pre-login vs authenticated). `extraData` opsiyonel
 * ama set edildiğinde tab identity'sine dahildir.
 */
export interface HomepageConfig {
  routeKey: string;
  extraData?: Record<string, unknown>;
}

export interface HistoryEntry {
  at: string;
  shellMode: ShellMode;
  tabKey?: string;
  item: NavigationItem;
  payload: Record<string, unknown>;
  closed?: boolean;
}

export interface NavigateContext {
  resolvedItems: NavigationItem[];
  payload: Record<string, unknown>;
  shellMode: ShellMode;
  lifetime: RouteLifetime;
  presentation: PresentationMode;
  restoreMode: RestoreMode;
  /** Surface navigasyonu: `tabKey`; overlay navigasyonu: underlay'in tabKey'i. */
  tabKey?: string;
  /** Overlay navigasyonunda dolu. */
  overlayKey?: string;
  source: NavigateSource;
}

export type NavigateResult =
  | {
      outcome: 'completed';
      resolvedItems: NavigationItem[];
      payload: Record<string, unknown>;
      presentation: PresentationMode;
      tabKey?: string;
      overlayKey?: string;
    }
  | { outcome: 'cancelled'; reason?: string }
  | { outcome: 'failed'; error: unknown };

// ---------------------------------------------------------------------------
// Delegate signatures (host-implemented)
// ---------------------------------------------------------------------------

export type OnEvaluate = (request: {
  item: NavigationItem;
  payload: Record<string, unknown>;
}) => Promise<NavigationItem[]>;

export type OnNavigate = (
  ctx: NavigateContext,
  surface: ViewSurface,
) => void | Promise<void>;

export type CreateViewSurface = (ctx: {
  /** Surface: `tabKey`; overlay: `overlayKey`. */
  handleKey: string;
  item: NavigationItem;
  presentation: PresentationMode;
}) => ViewSurface | Promise<ViewSurface>;

export type DisposeViewSurface = (surface: ViewSurface) => void | Promise<void>;

export type OnLog = (
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) => void;

export type BeforeNavigateHandler = (
  ctx: NavigateContext,
) =>
  | void
  | { cancel: true; reason?: string }
  | Promise<void | { cancel: true; reason?: string }>;

export type AfterNavigateHandler = (
  ctx: NavigateContext & {
    outcome: 'completed' | 'cancelled' | 'failed';
    error?: unknown;
    reason?: string;
  },
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface PageRouterOptions {
  routeRegistry: RouteRegistry | (() => Promise<RouteRegistry>);
  onEvaluate: OnEvaluate;
  onNavigate: OnNavigate;
  createViewSurface: CreateViewSurface;
  disposeViewSurface?: DisposeViewSurface;
  /**
   * Başlangıç modu. `routeRegistry.config.shellMode` sağlanmışsa burada
   * opsiyonel; ikisi de yoksa factory reject (`init-config-missing`).
   */
  shellMode?: ShellMode;
  /**
   * Aktif locale — `LocalizedString` map'lerinde key olarak kullanılır.
   * `routeRegistry.config.locale` sağlanmışsa burada opsiyonel; ikisi de
   * yoksa factory reject (`init-config-missing`).
   */
  locale?: string;
  fallbackLocale?: string;
  defaultLifetime?: RouteLifetime;
  defaultShellModeOnConflict?: ShellModeConflictPolicy;
  onLog?: OnLog;
}

// ---------------------------------------------------------------------------
// Public router interface
// ---------------------------------------------------------------------------

export interface NavigateRequest {
  routeKey?: string;
  routeDefinition?: RouteDefinition;
  lifetime?: RouteLifetime;
  restoreMode?: RestoreMode;
  presentation?: PresentationMode;
  extraData?: Record<string, unknown>;
  source?: 'routeKey' | 'routeDefinition' | 'deepLink';
}

export interface FindQuery {
  routeKey: string;
  payload?: Record<string, unknown>;
}

export interface IPageRouter {
  getRouteRegistry(): RouteRegistry;
  findRoute(routeKey: string): RouteDefinition | null;

  navigate(request: NavigateRequest): Promise<NavigateResult>;

  setShellMode(mode: ShellMode): Promise<NavigateResult>;
  getShellMode(): ShellMode;

  getLocale(): string;
  setLocale(locale: string): void;

  getHomepage(): HomepageConfig | null;
  setHomepage(
    config: HomepageConfig | null,
    options?: { navigate?: boolean },
  ): Promise<NavigateResult>;
  goHome(): Promise<NavigateResult>;

  getActiveView(): ActiveViewSnapshot | null;
  getOpenTabs(): ReadonlyArray<OpenTab>;
  getActiveTab(): OpenTab | null;
  findTabs(query: FindQuery): ReadonlyArray<OpenTab>;
  activateTab(tabKey: string): Promise<NavigateResult>;
  closeTab(tabKey: string): Promise<void>;
  pinTab(tabKey: string): void;
  unpinTab(tabKey: string): void;
  markTabDirty(tabKey: string, dirty: boolean): void;

  closeOverlay(overlayKey: string): Promise<void>;
  dismissTopOverlay(): Promise<void>;
  findOverlays(query: FindQuery): ReadonlyArray<OpenOverlay>;

  getHistory(): ReadonlyArray<HistoryEntry>;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): Promise<NavigateResult>;
  goForward(): Promise<NavigateResult>;
  clearHistory(): void;

  onBeforeNavigate(handler: BeforeNavigateHandler): Subscription;
  onAfterNavigate(handler: AfterNavigateHandler): Subscription;
  onTabOpened(handler: (tab: OpenTab) => void): Subscription;
  onTabClosed(handler: (tabKey: string) => void): Subscription;
  onTabActivated(handler: (tab: OpenTab) => void): Subscription;
  onTabPinned(handler: (tab: OpenTab) => void): Subscription;
  onTabUnpinned(handler: (tab: OpenTab) => void): Subscription;
  onTabDirtyChanged(handler: (tab: OpenTab) => void): Subscription;
  onShellModeChanged(handler: (mode: ShellMode) => void): Subscription;
  onOverlayOpened(handler: (overlay: OpenOverlay) => void): Subscription;
  onOverlayClosed(handler: (overlayKey: string) => void): Subscription;
  onHomepageChanged(
    handler: (config: HomepageConfig | null) => void,
  ): Subscription;
  onHistoryChanged(
    handler: (history: ReadonlyArray<HistoryEntry>) => void,
  ): Subscription;
  onLocaleChanged(handler: (locale: string) => void): Subscription;
}
