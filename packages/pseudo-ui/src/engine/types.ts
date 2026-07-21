export interface ComponentNode {
  type: string
  children?: ComponentNode[]
  [key: string]: unknown
}

export interface BindableNode extends ComponentNode {
  bind: string
  variant?: 'filled' | 'outlined'
}

export interface TextNode extends ComponentNode {
  type: 'Text'
  content: string | MultiLangText
  variant?: string
}

export interface ForEachNode extends ComponentNode {
  type: 'ForEach'
  source: string
  as: string
  template: ComponentNode
}

export interface NestedComponentNode extends ComponentNode {
  type: 'Component'
  ref: string
  bind?: string | Record<string, string>
}

/**
 * Amorphie navigation list: renders a data-bound array of nav items (groups +
 * leaves), and on tap emits a `navigate` action carrying the tapped item via the
 * delegate — so the host maps the intent to its router (open a view / start a
 * workflow) using the item's own `{type, key, config}`. Solves what a plain
 * ForEach+Button cannot (per-item navigation intent). Render-only + intent; the
 * component knows nothing about HTTP/routing.
 */
export interface NavigationNode extends ComponentNode {
  type: 'Navigation'
  /** Expression resolving to the nav-item array (e.g. "$instance.sidebarItems"). */
  items: string
}

/**
 * A placeholder where the HOST injects an arbitrary (framework-native) component
 * — e.g. a router's active view inside a master-layout view. Unlike
 * `NestedComponentNode` (which composes another pseudo-ui view), the host resolves
 * `ref` to a real component via `PseudoViewDelegate.resolveHostComponent`.
 */
export interface ContentOutletNode extends ComponentNode {
  type: 'ContentOutlet'
  ref: string
}

/**
 * A tab strip bound to the host's live open-tab state (MDI). Renders a tab per
 * item and emits `tab:activate` / `tab:close` actions (via delegate.onAction)
 * carrying `{ tabKey }`, so the host maps them to its router. Render-only +
 * intent. Toggle visibility with the generic `visible` prop (e.g. "$instance.isMdi").
 */
export interface TabStripNode extends ComponentNode {
  type: 'TabStrip'
  /** Expression → array of { tabKey, label, active?, closable? }. */
  tabs: string
}

/**
 * Drives a backend workflow instance and renders each state's server-defined
 * view inline. pseudo-ui stays a pure renderer: the HOST owns the workflow
 * client (start/transition/terminal) and returns a {@link WorkflowSession} from
 * `PseudoViewDelegate.driveWorkflow`; this node renders `session.view` and
 * bridges its `submit` actions back into `session.submit`. Config fields are
 * literals, or `$instance.*`/`$item.*` expressions resolved against the ctx.
 */
export interface WorkflowViewNode extends ComponentNode {
  type: 'WorkflowView'
  /** Workflow domain (e.g. "morph-idm"). */
  domain: string
  /** Workflow name/key. */
  name: string
  /** Optional pinned workflow version. */
  version?: string
  /** Where the instance key comes from (e.g. "activeUser"); host-interpreted. */
  keyFrom?: string
  /** Static start-payload merged into the instance on start. */
  start?: Record<string, unknown>
  /** Fields collected in a start form before the instance is created. */
  startFields?: WorkflowStartField[]
}

/** A start-payload field collected by the WorkflowView before the instance starts. */
export interface WorkflowStartField {
  name: string
  /** String, an { en, tr } map, or the core [{ language, label }] array. */
  label?: MultiLangText | string | Array<{ language: string; label: string }>
  type?: string
}

/** Resolved config the host receives to drive a {@link WorkflowViewNode}. */
export interface WorkflowViewConfig {
  domain: string
  name: string
  version?: string
  keyFrom?: string
  start?: Record<string, unknown>
  startFields?: WorkflowStartField[]
}

/** A column in an {@link InstanceListNode}: which snapshot field to show + its label. */
export interface InstanceColumn {
  /** Dot-path into the instance snapshot, e.g. "key", "status", "currentState",
   * "createdAt", "attributes.deviceId", "attributes.deviceInfo.deviceModel". */
  bind: string
  label?: MultiLangText | string | Array<{ language: string; label: string }>
  /**
   * Render hint (default: plain text):
   * - "datetime" | "date" — locale-format an ISO timestamp
   * - "chip" — neutral rounded pill (arbitrary strings, e.g. a business state)
   * - "status" — semantic-colored pill for the generic vNext instance-status
   *   enum (active → green, completed/passive → grey, busy/faulted → red)
   */
  format?: string
  /**
   * Backend field name this column sorts by (e.g. "createdAt"). Presence makes
   * the column header interactively sortable (click to toggle asc/desc). Omit
   * for columns the backend can't sort. May differ from {@link bind}.
   */
  sortField?: string
}

/**
 * Lists a workflow's instances (paged, read-only). The workflow + columns come
 * from the backend view config, so ONE generic node serves any list — a full
 * table or a slim summary — just by configuring different columns.
 */
export interface InstanceListNode extends ComponentNode {
  type: 'InstanceList'
  domain: string
  workflow: string
  version?: string
  pageSize?: number
  filter?: unknown
  sort?: unknown
  columns: InstanceColumn[]
}

/** A single page query the host runs for an {@link InstanceListNode}. */
export interface InstanceQuery {
  domain: string
  workflow: string
  version?: string
  page: number
  pageSize: number
  filter?: unknown
  sort?: unknown
}

/** One page of instance snapshots; `hasNext`/`hasPrev` drive the pager. */
export interface InstanceQueryResult {
  items: Record<string, unknown>[]
  hasNext: boolean
  hasPrev: boolean
}

/**
 * A minimal readable reactive cell. Structurally satisfied by a Vue `Ref<T>`,
 * so the host can return Vue refs without pseudo-ui depending on Vue here.
 */
export interface ReadableRef<T> {
  readonly value: T
}

/**
 * The reactive handle a host returns from `driveWorkflow`. pseudo-ui reads the
 * refs to render, and calls `start`/`submit` as the user interacts.
 */
export interface WorkflowSession {
  /** Current state's view (null until started / when a state has no view). */
  view: ReadableRef<ViewDefinition | null>
  /**
   * Current view's transition schema (resolved from the view's `dataSchema` by the
   * host), so the renderer can apply x-labels + validation. Null when unresolved.
   */
  schema?: ReadableRef<DataSchema | null>
  /** Current instance attributes, exposed to the view via `$instance.*`. */
  data: ReadableRef<Record<string, unknown>>
  /** True once an instance is started and its view is available. */
  ready: ReadableRef<boolean>
  /** Human-readable error text; empty string when there is none. */
  error: ReadableRef<string>
  /** Start the instance, merging any collected start-form values. */
  start(values?: Record<string, unknown>): Promise<void>
  /** Fire a transition for a pseudo-ui submit (command = transition key/URN). */
  submit(command: string, data: Record<string, unknown>): Promise<void>
  /** Release the underlying workflow subscription (called on unmount). */
  dispose?(): void
}

export type ButtonAction = 'submit' | 'cancel' | 'back'

export interface ButtonNode extends ComponentNode {
  type: 'Button'
  label: string | MultiLangText
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal'
  icon?: string
  action: ButtonAction | ActionDescriptor
  command?: string
  /** Truthy expression (e.g. "$item.active") → renders the selected/active state. */
  active?: string
}

export interface CardNode extends ComponentNode {
  type: 'Card'
  variant?: 'elevated' | 'filled' | 'outlined'
  /**
   * Primary action for the card. Preferred over the legacy `onTap`.
   * Both prop names are honoured at runtime; `action` wins when both
   * are present.
   */
  action?: ActionDescriptor | ActionDescriptor[]
  /** @deprecated Use `action`. Kept for backward compatibility. */
  onTap?: ActionDescriptor | ActionDescriptor[]
}

export interface SnackbarNode extends ComponentNode {
  type: 'Snackbar'
  content: string | MultiLangText
  variant?: 'standard' | 'success' | 'error' | 'warning' | 'info'
  duration?: number
  /** Optional inline action button (e.g. "Undo"). */
  action?: ActionDescriptor
}

export interface NavigationDrawerItem {
  /** Visible label. Multi-lang. */
  label?: string | MultiLangText
  /** Material icon name (ligature). */
  icon?: string
  /** Optional trailing badge (e.g. unread count). */
  badge?: string | MultiLangText
  /** Action fired on tap. */
  action?: ActionDescriptor
  /** Render as a horizontal divider instead of a tappable row. */
  divider?: true
  /** Render as a non-tappable section header. */
  header?: string | MultiLangText
}

export interface NavigationDrawerNode extends ComponentNode {
  type: 'NavigationDrawer'
  items: NavigationDrawerItem[]
  header?: ComponentNode
  variant?: 'standard' | 'modal'
  visible?: string | boolean
}

export interface MenuItem {
  label?: string | MultiLangText
  icon?: string
  action?: ActionDescriptor
  disabled?: boolean
  divider?: true
  header?: string | MultiLangText
}

export interface MenuNode extends ComponentNode {
  type: 'Menu'
  items: MenuItem[]
  /** Trigger element. If omitted, a default kebab IconButton is rendered. */
  anchor?: ComponentNode
}

export interface TabViewNode extends ComponentNode {
  type: 'TabView'
  tabs: TabDefinition[]
}

export interface TabDefinition {
  title: string | MultiLangText
  icon?: string
  content: ComponentNode[]
}

export interface ActionDescriptor {
  /**
   * Action verb. Three values have SDK-internal meaning:
   *   - `'submit'`  → SDK runs `validateAllFields()` first; on errors,
   *                   dispatch is blocked. Validation is on by default.
   *   - `'select'`  → SDK sets the value inline on `$form.<path>` or
   *                   `$ui.<path>` (host delegate is NOT called).
   *   - `'reset'`   → SDK clears `formData` and `errors`; then the host
   *                   delegate is called so it can react if needed.
   * Anything else is opaque to the SDK and dispatched to the host
   * delegate as-is — use it for domain dispatches (e.g. URN-encoded
   * workflow commands).
   */
  action: string
  /**
   * Free-form domain payload — typically a URN that the host resolves
   * (workflow command, integration ref, navigation target). Opaque to
   * the SDK.
   */
  command?: string
  /** Required when `action === 'select'`. Target binding path. */
  bind?: string
  /** Required when `action === 'select'`. Literal value or `$...` expression. */
  value?: unknown
  /**
   * Should the SDK run `validateAllFields()` before dispatching?
   *
   * Defaults:
   *   - `submit` → `true`  (set `validate: false` to bypass)
   *   - anything else → `false`  (set `validate: true` to opt in)
   *
   * Use this flag to make a workflow transition behave like a submit
   * without naming the action `submit`:
   *   `{ action: 'dispatch', command: 'urn:wf:next', validate: true }`
   */
  validate?: boolean
  /**
   * Side-channel hooks fired *before* the main delegate dispatch.
   * Each hook is forwarded to `delegate.onAction` with a `context.phase
   * === 'pre'`. Use for audit, telemetry, prefetch, guards. See
   * `ActionHook` for sync/async semantics.
   *
   * Hooks fire only when the main dispatch actually reaches the host —
   * a validation failure or a `select` short-circuit skips them.
   */
  preHooks?: ActionHook[]
  /**
   * Side-channel hooks fired *after* the main delegate dispatch. Skipped
   * if the main dispatch never ran (validation failure, select
   * short-circuit, or a sync pre-hook abort).
   */
  postHooks?: ActionHook[]
}

/**
 * Pre/post side-channel signal that piggy-backs on the main action
 * delegation. The SDK forwards a hook through the same
 * `delegate.onAction(verb, formData, command, context)` channel as the
 * main action, with `context.phase` of `'pre'` or `'post'` and
 * `context.parent` pointing at the owning main action.
 *
 * Reserved verbs (`submit`, `select`, `reset`) are rejected at runtime
 * with a `warn` log and skipped — hooks are pure side-channel signals
 * and must not trigger SDK-internal behaviour.
 */
export interface ActionHook {
  /** Hook action verb. Opaque to the SDK. */
  action: string
  /** Optional URN command, opaque to the SDK. */
  command?: string
  /**
   * Await the delegate call?
   *
   *   - `true`  → SDK awaits the hook. A **pre-hook** rejection aborts
   *     the pipeline (main + post skipped). A **post-hook** rejection
   *     is logged at `error` and the remaining post-hooks continue.
   *   - `false` (default) → fire-and-forget; rejections are logged at
   *     `warn` and never block the main dispatch.
   *
   * Default is `false` so hooks never accidentally block the user's
   * primary action on a poorly-behaved handler.
   */
  sync?: boolean
}

/**
 * Phase metadata passed as the 4th argument to `delegate.onAction` when
 * the SDK is orchestrating a pre/post hook pipeline. The argument is
 * omitted entirely when the descriptor declares no hooks — preserving
 * the existing 3-argument call shape for backward compatibility.
 */
export interface ActionDispatchContext {
  /** `'pre'` / `'main'` / `'post'`. */
  phase: 'pre' | 'main' | 'post'
  /** True for `phase === 'main'`. For hooks, mirrors `hook.sync`. */
  sync: boolean
  /** On `'pre'` and `'post'` calls, the owning main action. */
  parent?: { action: string; command?: string }
}

export interface MultiLangText {
  [langCode: string]: string
}

export interface SchemaProperty {
  type?: string
  format?: string
  enum?: string[]
  const?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  pattern?: string
  properties?: Record<string, SchemaProperty>
  items?: SchemaProperty
  'x-labels'?: MultiLangText
  'x-errorMessages'?: Record<string, MultiLangText>
  'x-lov'?: LovDefinition
  'x-lookup'?: LookupDefinition
  'x-enum'?: Record<string, MultiLangText>
  'x-binding'?: 'required' | 'optional'
  'x-conditional'?: ConditionalDefinition
  'x-validation'?: ValidationDefinition
}

export interface ArrayFieldNode extends BindableNode {
  type: 'ArrayField'
}

export interface LookupDefinition {
  source: string
  resultField: string
  filter?: LovFilterParam[]
}

export interface LovDefinition {
  source: string
  valueField: string
  displayField: string
  filter?: LovFilterParam[]
}

export interface LovFilterParam {
  param: string
  value: string
  required?: boolean
}

export interface ConditionalDefinition {
  showIf?: ConditionRule
  hideIf?: ConditionRule
  enableIf?: ConditionRule
  disableIf?: ConditionRule
}

export interface ConditionRule {
  field?: string
  operator?: string
  value?: unknown
  allOf?: ConditionRule[]
  anyOf?: ConditionRule[]
  not?: ConditionRule
}

export interface ValidationDefinition {
  rule: string
  parameters?: Record<string, unknown>
  errorMessages?: MultiLangText
}

export interface DataSchema {
  $schema?: string
  $id?: string
  title?: string
  description?: string
  type?: string
  required?: string[]
  properties?: Record<string, SchemaProperty>
  allOf?: unknown[]
}

export interface ViewDefinition {
  $schema: string
  dataSchema: string
  lookups?: string[]
  uiState?: Record<string, unknown>
  view: ComponentNode
}

export interface LovItem {
  value: string
  display: string
  [key: string]: unknown
}

export interface FormContext {
  schema: DataSchema
  formData: Record<string, unknown>
  instanceData: Record<string, unknown>
  params: Record<string, unknown>
  uiState: Record<string, unknown>
  lovData: Record<string, LovItem[]>
  lookupData: Record<string, Record<string, unknown>>
  lang: string
  errors: Record<string, string>
  /**
   * Top-level field names the current view actually binds/renders. When set,
   * submit-time validation is restricted to these — a schema `required` field the
   * view doesn't render (e.g. supplied via x-context-source / start attributes)
   * must not block submit. Empty/unset = validate all schema properties.
   */
  boundFields?: Set<string>
  /**
   * Designer/preview mode flag. When true, adapters render structural
   * placeholders that the live runtime would otherwise skip:
   *   - `ForEach` with an empty `source` renders its template once with an
   *     empty `$item` so the structure is visible.
   *   - `x-conditional` visibility rules are bypassed (`visible: true`),
   *     letting view.json editors see hidden states. `enabled` is preserved
   *     so the designer can still observe disabled styling.
   * Validation behaviour is unchanged — `validateAllFields` continues to
   * skip fields that the original (non-designer) visibility rules hide.
   */
  designerMode?: boolean
}

// ---------------------------------------------------------------------------
// Delegate pattern – consumer implements this to supply data & handle actions
// ---------------------------------------------------------------------------

export type RequestDataFn = (
  ref: string,
  params?: Record<string, string>,
) => Promise<unknown>

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface PseudoViewDelegate {
  requestData: RequestDataFn
  loadComponent(ref: string): Promise<{ schema: DataSchema; view: ViewDefinition }>
  /**
   * Resolve a host-owned component to mount at a `ContentOutlet` node (e.g. the
   * router's active-view shell). Returns the framework-native component, or
   * null/undefined if the ref is unknown. Synchronous — the host holds it already.
   */
  resolveHostComponent?(ref: string): unknown
  /**
   * Drive a backend workflow for a `WorkflowView` node. The host owns the
   * workflow client; pseudo-ui renders each state's view and bridges submits.
   * Returns a reactive {@link WorkflowSession}. Required only if views use
   * `WorkflowView` nodes.
   */
  driveWorkflow?(config: WorkflowViewConfig): WorkflowSession
  /**
   * Query a workflow's instances for an `InstanceList` node (one page, read-only).
   * The host owns the transport; pseudo-ui renders the table + pager. Required
   * only if views use `InstanceList` nodes.
   */
  queryInstances?(input: InstanceQuery): Promise<InstanceQueryResult>
  /**
   * Called when a user-triggered action reaches the host. For a plain
   * action, the SDK invokes this with three arguments (the 4th
   * `context` is omitted). When the `ActionDescriptor` declares
   * `preHooks` or `postHooks`, the SDK orchestrates
   * `pre → main → post` and calls `onAction` once per phase with the
   * 4th `context` argument populated so the host can distinguish them.
   */
  onAction(
    action: string,
    formData: Record<string, unknown>,
    command?: string,
    context?: ActionDispatchContext,
  ): Promise<void>
  onValidationRequest?(field: string, value: unknown, formData: Record<string, unknown>): Promise<string | null>
  onLog?(level: LogLevel, message: string, error?: unknown, context?: Record<string, unknown>): void

  /**
   * Designer-mode callbacks. Triggered only when `<PseudoView designer />` is on.
   * `path` is a JSON Pointer (RFC 6901), e.g. `/view/children/0/actions/1`.
   * The host owns the view tree — these fire as signals; the host mutates the
   * tree (using the exported tree utilities) and re-passes it to PseudoView.
   */
  onNodeSelect?(path: string, node: ComponentNode): void
  onNodeHover?(path: string | null, node: ComponentNode | null): void
  onNodeDelete?(path: string): void | Promise<void>
  onNodeMove?(fromPath: string, toParentPath: string, key: string, index: number): void | Promise<void>
  onNodeDropFromPalette?(targetParentPath: string, key: string, index: number, paletteType: string): void | Promise<void>
}
