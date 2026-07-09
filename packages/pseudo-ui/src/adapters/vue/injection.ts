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
