import { provide, inject, type InjectionKey } from 'vue'
import type { PseudoViewDelegate } from '../../engine/types'

export type DesignerMode = 'off' | 'preview' | 'edit'

export interface DesignerClassNames {
  /** Replaces the base `pseudo-designer-node` class. */
  node?: string
  /** Added when the node matches `selectedNodePath`. */
  selected?: string
  /** Added while dragging a payload over the top quarter of the node. */
  dropBefore?: string
  /** Added while dragging over the bottom quarter. */
  dropAfter?: string
  /** Added while dragging into the body of a container. */
  dropInside?: string
  /** Replaces the `pseudo-designer-delete-btn` class. */
  deleteButton?: string
}

export interface DesignerState {
  mode: DesignerMode
  selectedNodePath?: string
  classNames?: DesignerClassNames
}

const DELEGATE_KEY: InjectionKey<PseudoViewDelegate> = Symbol('PseudoViewDelegate')

export function provideDelegate(delegate: PseudoViewDelegate) {
  provide(DELEGATE_KEY, delegate)
}

export function useDelegate(): PseudoViewDelegate {
  const delegate = inject(DELEGATE_KEY)
  if (!delegate) throw new Error('PseudoViewDelegate not provided. Wrap your component tree with <PseudoView>.')
  return delegate
}

const RENDER_ROOT_KEY: InjectionKey<ShadowRoot | undefined> = Symbol('PseudoViewRenderRoot')

export function provideRenderRoot(root: ShadowRoot | undefined) {
  provide(RENDER_ROOT_KEY, root)
}

/**
 * Returns the shadow host element to use as `appendTo` for PrimeVue
 * overlays when `<PseudoView>` is mounted inside a Shadow DOM. Returns
 * `undefined` when rendering into light DOM (PrimeVue keeps its default
 * `document.body` target).
 */
export function useOverlayTarget(): HTMLElement | undefined {
  const root = inject(RENDER_ROOT_KEY, undefined)
  return root ? (root.host as HTMLElement) : undefined
}

/**
 * Generic UI-chrome strings the SDK renders itself (section headings, empty-state
 * text, tooltips) — keyed by a stable identifier, each value a localizable label
 * ([{language,label}] / {en,tr} / string). Supplied by the host from backend
 * config so the SDK ships ZERO translated literals: a new language is a config
 * edit, never a code change. Injected once at the root; nested contexts inherit
 * it (they don't re-provide), so lookups resolve against the host's dictionary.
 */
export type UiStrings = Record<string, unknown>

const UI_STRINGS_KEY: InjectionKey<UiStrings> = Symbol('PseudoUiStrings')

export function provideUiStrings(strings: UiStrings) {
  provide(UI_STRINGS_KEY, strings)
}

/** The host-provided UI-strings dictionary (empty when none supplied). */
export function useUiStrings(): UiStrings {
  return inject(UI_STRINGS_KEY, {})
}

/**
 * Config-referenced surface views: a registry mapping a well-known surface key
 * (e.g. `transitionHistory`) to a backend view ref + display hint
 * (`{ key, domain?, flow?, display?: 'modal' | 'page', route? }`). Host-fed from
 * config so an SDK-opened surface's CONTENT is a config-authored view (the SDK
 * only does plumbing: resolve → load → feed data → modal/page). A surface with
 * no entry falls back to the SDK's built-in leaf.
 */
export type ConfigViews = Record<string, unknown>

const CONFIG_VIEWS_KEY: InjectionKey<ConfigViews> = Symbol('PseudoConfigViews')

export function provideConfigViews(views: ConfigViews) {
  provide(CONFIG_VIEWS_KEY, views)
}

export function useConfigViews(): ConfigViews {
  return inject(CONFIG_VIEWS_KEY, {})
}

const DATA_DOMAIN_KEY: InjectionKey<string> = Symbol('PseudoDataDomain')

/**
 * Default data domain for nodes that query instances (e.g. InstanceList) when
 * their own config omits `domain`. Host-fed from backend config so a
 * solution-specific domain literal isn't repeated in every view. Empty when
 * none supplied (the node must then carry its own `domain`).
 */
export function provideDataDomain(domain: string) {
  provide(DATA_DOMAIN_KEY, domain)
}

export function useDataDomain(): string {
  return inject(DATA_DOMAIN_KEY, '')
}

const DESIGNER_KEY: InjectionKey<DesignerState> = Symbol('PseudoDesigner')

/**
 * Provide reactive designer state from `<PseudoView>` so every nested
 * `DynamicRenderer`/`DesignerNode` can read the current mode, selected
 * node path and class-name overrides. Pass a reactive object so that
 * prop changes on PseudoView propagate without re-providing.
 */
export function provideDesigner(state: DesignerState) {
  provide(DESIGNER_KEY, state)
}

/**
 * Returns the designer state when `<PseudoView>` is in designer/preview
 * mode, or `undefined` for normal rendering.
 */
export function useDesigner(): DesignerState | undefined {
  return inject(DESIGNER_KEY, undefined)
}
