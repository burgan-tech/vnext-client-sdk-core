<!--
  InstanceList node — a paged, read-only table of a workflow's instances. The HOST
  runs the query (delegate.queryInstances); pseudo-ui renders the table + pager and
  drives paging. The workflow + columns (which snapshot field + label) come from the
  backend view config, so one generic node serves any list (full table or slim
  summary). No solution-specific content lives here.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type {
  InstanceColumn,
  InstanceListNode,
  InstanceRowAction,
  ViewDefinition,
  DataSchema,
} from '../../engine/types'
import { localizeLabel } from '../../engine/expressionResolver'
import { useFormContext } from './useFormContext'
import { useDelegate, useUiStrings, useDataDomain } from './injection'
import { useHistory } from './useHistory'
import HistoryModal from './HistoryModal.vue'
import TransitionForm from './TransitionForm.vue'

const props = defineProps<{ node: InstanceListNode }>()
const ctx = useFormContext()
const delegate = useDelegate()
const log = delegate.onLog ?? (() => {})

// Generic UI-chrome strings (section headings, empty-state, tooltips) come from
// the host's config-fed dictionary — never a translated literal in this SDK. A
// missing key falls back to the key id (visible-but-honest), so a new language
// is a config edit, not a code change.
const uiStrings = useUiStrings()
function uiText(key: string): string {
  return localizeLabel(uiStrings[key] as never, ctx.lang) || key
}

// The listed instances' data domain. A solution-specific domain literal (e.g. an
// IDM domain) doesn't belong in every view: when the node omits `domain` we fall
// back to a host-provided default (fed from config). See useDataDomain.
const defaultDomain = useDataDomain()
const domain = computed<string>(() => props.node.domain || defaultDomain || '')

// Columns = the view's business columns + a standard trailing trio (state /
// status / created) that EVERY instance carries. Views declare only what's
// specific to them; a view opts out of the trio with `systemColumns: false`.
// The trio's labels resolve from config (see colLabel), so no literals here.
const SYSTEM_COLUMNS: InstanceColumn[] = [
  { bind: 'currentState', format: 'chip', sortField: 'currentState', filter: { field: 'currentState', type: 'state' } },
  { bind: 'status', format: 'status', sortField: 'status', filter: { field: 'status', type: 'status' } },
  { bind: 'createdAt', format: 'datetime', sortField: 'createdAt', filter: { field: 'createdAt', type: 'daterange' } },
]
const columns = computed<InstanceColumn[]>(() => {
  const base = props.node.columns ?? []
  return props.node.systemColumns === false ? base : [...base, ...SYSTEM_COLUMNS]
})

// Row-detail: click a row → open the instance's detail. Default is clickable,
// routing to the generic `instance-detail` surface; a view opts out with
// `rowDetail: false`. `title`/`subtitle` stay per-view.
const rowDetail = computed(() => {
  const rd = props.node.rowDetail
  if (rd === false) return null
  const base = rd && typeof rd === 'object' ? rd : {}
  return { navigate: 'instance-detail', ...base } as { navigate: string; title?: unknown; subtitle?: string }
})

// Sort is view-driven (a column marked `sortField` is clickable to re-sort);
// when the view omits `sort` we default to newest-first. No field hard-coded.
type SortSpec = { field: string; direction: 'asc' | 'desc' }
function normalizeSort(s: unknown): SortSpec | undefined {
  if (s && typeof s === 'object') {
    const o = s as Record<string, unknown>
    if (typeof o.field === 'string' && (o.direction === 'asc' || o.direction === 'desc')) {
      return { field: o.field, direction: o.direction }
    }
  }
  return undefined
}
const activeSort = ref<SortSpec | undefined>(normalizeSort(props.node.sort) ?? { field: 'createdAt', direction: 'desc' })

const pageSize = computed(() =>
  typeof props.node.pageSize === 'number' && props.node.pageSize > 0 ? props.node.pageSize : 20,
)

const page = ref(1)
const items = ref<Record<string, unknown>[]>([])
const hasNext = ref(false)
const hasPrev = ref(false)
const lastPage = ref<number | undefined>(undefined)
const loading = ref(false)
const errorText = ref('')

type FieldFilter = { field: string; operator: string; value: unknown; isAttribute: boolean }
type DateRange = { from?: string; to?: string }
type FilterValue = string | string[] | DateRange
type FilterOption = { value: string; label?: unknown }

// Generic vNext instance-status enum — the built-in options for a "status" filter.
const STATUS_OPTIONS: FilterOption[] = [
  { value: 'active', label: { en: 'Active', tr: 'Aktif' } },
  { value: 'busy', label: { en: 'Busy', tr: 'Meşgul' } },
  { value: 'passive', label: { en: 'Passive', tr: 'Pasif' } },
  { value: 'completed', label: { en: 'Completed', tr: 'Tamamlandı' } },
  { value: 'faulted', label: { en: 'Faulted', tr: 'Hatalı' } },
]
// A "state" filter's options are the workflow's own states, fetched at mount.
const workflowStates = ref<FilterOption[]>([])

function filterType(c: InstanceColumn): string {
  return c.filter?.type ?? 'text'
}
function optionsFor(c: InstanceColumn): FilterOption[] {
  const t = filterType(c)
  if (t === 'status') return STATUS_OPTIONS
  if (t === 'state') return workflowStates.value
  return []
}
function optLabel(o: FilterOption): string {
  return localizeLabel(o.label as never, ctx.lang) || o.value
}
function defaultOp(type: string): string {
  // status/state are multi-select → `in`; text → `like`; dates → `between`.
  return type === 'daterange' ? 'between' : type === 'status' || type === 'state' ? 'in' : 'like'
}
function isEnum(c: InstanceColumn): boolean {
  const t = filterType(c)
  return t === 'status' || t === 'state'
}

// An incoming filter seeded by the host (e.g. a drill-down passes it via the
// surface's instanceData). Entries whose field matches a filterable column are
// shown as an active column filter; the rest apply as a hidden base (below).
const seedFilter = computed<FieldFilter[]>(() =>
  Array.isArray(ctx.instanceData?.filter) ? (ctx.instanceData.filter as FieldFilter[]) : [],
)
function columnFor(field: string): InstanceColumn | undefined {
  return columns.value.find((c) => c.filter?.field === field)
}
function seededColumnValues(): Record<string, FilterValue> {
  const out: Record<string, FilterValue> = {}
  for (const e of seedFilter.value) {
    if (columnFor(e.field)) out[e.field] = String(e.value)
  }
  return out
}

// Column filters are view-driven: a column with a `filter` config gets a funnel
// icon opening a type-specific control (text search / enum select / date range).
// `draft` holds live edits; `applied` is the committed set that drives the query.
// Both start from any seeded filter so a drill-down opens with the funnel filled.
const draftFilters = ref<Record<string, FilterValue>>(seededColumnValues())
const appliedFilters = ref<Record<string, FilterValue>>(seededColumnValues())
const openFilter = ref<string | null>(null)
let filterTimer: ReturnType<typeof setTimeout> | undefined

function toggleFilter(c: InstanceColumn): void {
  if (!c.filter) return
  openFilter.value = openFilter.value === c.filter.field ? null : c.filter.field
}
function setDraft(field: string, value: FilterValue): void {
  draftFilters.value = { ...draftFilters.value, [field]: value }
}
function commit(): void {
  page.value = 1
  appliedFilters.value = { ...draftFilters.value }
}
/** Free-text: debounce so we re-query once typing pauses. */
function onTextInput(c: InstanceColumn, value: string): void {
  if (!c.filter) return
  setDraft(c.filter.field, value)
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(commit, 350)
}
/** Enum multi-select (status / state): toggle a value, commit immediately. */
function arrVal(c: InstanceColumn): string[] {
  const v = c.filter ? draftFilters.value[c.filter.field] : undefined
  return Array.isArray(v) ? v : []
}
function isChecked(c: InstanceColumn, value: string): boolean {
  return arrVal(c).includes(value)
}
function onToggle(c: InstanceColumn, value: string): void {
  if (!c.filter) return
  const cur = arrVal(c)
  setDraft(c.filter.field, cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value])
  commit()
}
/** Date range endpoint change: commit immediately. */
function onDate(c: InstanceColumn, which: 'from' | 'to', value: string): void {
  if (!c.filter) return
  const cur = draftFilters.value[c.filter.field]
  const range: DateRange = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {}
  range[which] = value
  setDraft(c.filter.field, range)
  commit()
}
function dateVal(c: InstanceColumn, which: 'from' | 'to'): string {
  const v = c.filter ? draftFilters.value[c.filter.field] : undefined
  return v && typeof v === 'object' && !Array.isArray(v) ? (v[which] ?? '') : ''
}
function textVal(c: InstanceColumn): string {
  const v = c.filter ? draftFilters.value[c.filter.field] : undefined
  return typeof v === 'string' ? v : ''
}
function clearFilter(c: InstanceColumn): void {
  if (!c.filter) return
  const field = c.filter.field
  const nextDraft = { ...draftFilters.value }
  const nextApplied = { ...appliedFilters.value }
  delete nextDraft[field]
  delete nextApplied[field]
  draftFilters.value = nextDraft
  page.value = 1
  appliedFilters.value = nextApplied
  openFilter.value = null
}
function isFiltered(c: InstanceColumn): boolean {
  if (!c.filter) return false
  const v = appliedFilters.value[c.filter.field]
  if (v == null) return false
  if (typeof v === 'string') return v !== ''
  if (Array.isArray(v)) return v.length > 0
  return !!(v.from || v.to)
}

/** Column filters (server-side) built from the committed `appliedFilters` set. */
function columnFilters(): FieldFilter[] {
  const out: FieldFilter[] = []
  for (const c of columns.value) {
    if (!c.filter) continue
    const v = appliedFilters.value[c.filter.field]
    if (v == null) continue
    const operator = c.filter.op ?? defaultOp(filterType(c))
    const base = { field: c.filter.field, operator, isAttribute: !!c.filter.isAttribute }
    if (Array.isArray(v)) {
      // Multi-select enum → `in [values]`.
      if (v.length) out.push({ ...base, value: v })
    } else if (typeof v === 'object') {
      // Date range → `between [start, end]`; a missing bound gets a wide default
      // (the backend ignores gte/lte, so a two-sided range is the only option).
      if (!v.from && !v.to) continue
      const from = v.from ? `${v.from}T00:00:00Z` : '1970-01-01T00:00:00Z'
      const to = v.to ? `${v.to}T23:59:59Z` : '2999-12-31T23:59:59Z'
      out.push({ ...base, value: [from, to] })
    } else if (v !== '') {
      out.push({ ...base, value: v })
    }
  }
  return out
}

/** Config base filter + seeded filters without a visible column + column filters. */
function effectiveFilter(): unknown {
  const cols = columnFilters()
  const configBase = Array.isArray(props.node.filter) ? (props.node.filter as FieldFilter[]) : []
  // Seeded entries that map to a column are already covered by `cols`; the rest
  // apply invisibly (no matching filterable column to show them in).
  const seedBase = seedFilter.value.filter((e) => !columnFor(e.field))
  const all = [...configBase, ...seedBase, ...cols]
  if (all.length) return all
  return props.node.filter ?? undefined
}

// Generic column binds every instance list shares — their labels come from the
// config-fed dictionary so a column can omit `label` (and a new language is a
// config edit). A view's own `label` always wins.
const COL_LABEL_KEYS: Record<string, string> = {
  key: 'list.col.key',
  currentState: 'list.col.state',
  status: 'list.col.status',
  createdAt: 'list.col.created',
}
function colLabel(c: InstanceColumn): string {
  const explicit = localizeLabel(c.label, ctx.lang)
  if (explicit) return explicit
  const k = COL_LABEL_KEYS[c.bind ?? '']
  if (k) return uiText(k)
  return c.bind ?? ''
}

/** Run a row action (from an action column or a menu item) against a row. */
function runAction(a: InstanceRowAction | undefined, row: Record<string, unknown>, label?: unknown): void {
  if (!a || !delegate.onAction) return
  const title = localizeLabel(label as never, ctx.lang) || a.navigate
  const sub = a.subtitle ? fillTemplate(a.subtitle, row) : undefined
  // Detail mode: open a single related record's detail (e.g. login → its user).
  if (a.detail) {
    const instanceId = getPath(row, a.detail.instanceIdFrom)
    if (instanceId == null || instanceId === '') return
    delegate.onAction('navigate', {
      key: a.navigate,
      payload: { domain: a.detail.domain, workflow: a.detail.workflow, instanceId, title, subtitle: sub ?? String(instanceId) },
    })
    return
  }
  // Start mode: start a workflow for the row (e.g. change-password on a user).
  if (a.start) {
    const startKey = getPath(row, a.start.keyFrom)
    if (startKey == null || startKey === '') return
    delegate.onAction('navigate', {
      key: a.navigate,
      payload: { domain: a.start.domain, workflow: a.start.workflow, startKey, title, subtitle: sub ?? String(startKey) },
    })
    return
  }
  // Filter mode: open a target list filtered from the row.
  const filter = (a.filter ?? [])
    .map((f) => ({
      field: f.field,
      operator: f.op ?? 'eq',
      value: getPath(row, f.valueFrom),
      isAttribute: !!f.isAttribute,
    }))
    .filter((f) => f.value != null && f.value !== '')
  const payload: Record<string, unknown> = { filter }
  for (const f of filter) payload[f.field] = f.value
  if (sub) payload.subtitle = sub
  delegate.onAction('navigate', { key: a.navigate, payload })
}

// Menu (combo) columns: the open dropdown is teleported to <body> and fixed to
// the button's rect, so the table's overflow never clips it.
type MenuEntry = {
  label?: unknown
  heading?: unknown
  italic?: boolean
  loading?: boolean
  empty?: boolean
  builtin?: 'details' | 'metadata' | 'history' | 'transition'
  txKey?: string
  hasView?: boolean
  action?: InstanceRowAction
}
type TxState = { loading: boolean; items: Array<{ key: string; hasView?: boolean }> }
type OpenMenu = { id: string; items: MenuEntry[]; row: Record<string, unknown>; top: number; right: number }
const openMenu = ref<OpenMenu | null>(null)

/**
 * Compose a row's ⋯ menu — one uniform menu for every list, assembled from the
 * node's own config: Details, then the `links` section, the `actions` section,
 * the instance's available transitions (lazy), then a technical Metadata/History
 * section. There is no per-column "menu"; the sections are first-class node props.
 */
function composeMenu(tx: TxState): MenuEntry[] {
  const items: MenuEntry[] = []
  if (rowDetail.value) items.push({ label: uiText('list.menu.details'), builtin: 'details' })
  const links = props.node.links ?? []
  if (links.length) {
    items.push({ heading: uiText('list.menu.links') })
    items.push(...links.map((l) => ({ label: l.label, action: l.action })))
  }
  const actions = props.node.actions ?? []
  if (actions.length) {
    items.push({ heading: uiText('list.menu.actions') })
    items.push(...actions.map((a) => ({ label: a.label, action: a.action })))
  }
  if (delegate.getInstanceTransitions) {
    items.push({ heading: uiText('list.menu.transitions') })
    if (tx.loading) items.push({ loading: true })
    else if (!tx.items.length) items.push({ empty: true })
    else items.push(...tx.items.map((t) => ({ label: t.key, builtin: 'transition' as const, txKey: t.key, hasView: t.hasView })))
  }
  const tech: MenuEntry[] = [{ label: uiText('list.menu.metadata'), builtin: 'metadata', italic: true }]
  if (delegate.getTransitionHistory) tech.push({ label: uiText('list.menu.history'), builtin: 'history', italic: true })
  items.push({ heading: uiText('list.menu.system') })
  items.push(...tech)
  return items
}
function instanceIdOf(row: Record<string, unknown>): string {
  return String(row.id ?? row.key ?? '')
}
function toggleMenu(id: string, row: Record<string, unknown>, e: MouseEvent): void {
  if (openMenu.value?.id === id) {
    openMenu.value = null
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const tx: TxState = { loading: !!delegate.getInstanceTransitions, items: [] }
  openMenu.value = { id, items: composeMenu(tx), row, top: r.bottom + 4, right: window.innerWidth - r.right }
  // Lazy-load this instance's available transitions (only when the menu opens).
  if (delegate.getInstanceTransitions) {
    delegate
      .getInstanceTransitions({ domain: domain.value, workflow: props.node.workflow, instanceId: instanceIdOf(row) })
      .then((txs) => {
        if (openMenu.value?.id !== id) return
        openMenu.value = { ...openMenu.value, items: composeMenu({ loading: false, items: txs }) }
      })
      .catch(() => {
        if (openMenu.value?.id !== id) return
        openMenu.value = { ...openMenu.value, items: composeMenu({ loading: false, items: [] }) }
      })
  }
}
function pickMenu(item: MenuEntry, row: Record<string, unknown>): void {
  if (item.loading || item.empty) return
  openMenu.value = null
  if (item.builtin === 'details') return onRowClick(row)
  if (item.builtin === 'metadata') {
    metaRow.value = row
    return
  }
  if (item.builtin === 'history') return void openHistoryFor(row)
  if (item.builtin === 'transition') return void onTransition(row, item.txKey ?? '', !!item.hasView)
  runAction(item.action, row, item.label)
}

// A transition that needs input opens its FORM (view+schema, prefilled for edit)
// in a modal; Save fires the transition + reloads. No-form transitions fire ad-hoc.
type TxForm = { view: ViewDefinition; schema: DataSchema | null; validationSchema: DataSchema | null; data: Record<string, unknown>; txKey: string; instanceId: string }
const txForm = ref<TxForm | null>(null)

async function onTransition(row: Record<string, unknown>, txKey: string, hasView: boolean): Promise<void> {
  if (!txKey) return
  const instanceId = instanceIdOf(row)
  if (hasView && delegate.getTransitionForm) {
    const form = await delegate.getTransitionForm({ domain: domain.value, workflow: props.node.workflow, instanceId, transitionKey: txKey })
    if (form?.view) {
      txForm.value = { view: form.view, schema: form.schema ?? null, validationSchema: form.validationSchema ?? null, data: form.data ?? {}, txKey, instanceId }
      return
    }
  }
  // No form → fire the transition ad-hoc.
  if (!delegate.applyTransition) return
  await delegate.applyTransition({ domain: domain.value, workflow: props.node.workflow, instanceId, transitionKey: txKey })
  await load()
}

async function onTxApply(body: Record<string, unknown>): Promise<void> {
  const f = txForm.value
  if (!f || !delegate.applyTransition) return
  txForm.value = null // close the form; the view owns its own busy affordance
  await delegate.applyTransition({ domain: domain.value, workflow: props.node.workflow, instanceId: f.instanceId, transitionKey: f.txKey, body })
  await load()
}

// Transition history (list row menu → History). The surface (config view in a
// modal / page, or the built-in fallback) is decided by useHistory.
const history = useHistory()
async function openHistoryFor(row: Record<string, unknown>): Promise<void> {
  if (!delegate.getTransitionHistory) return
  const instanceId = instanceIdOf(row)
  await history.show(
    { domain: domain.value, workflow: props.node.workflow, instanceId, title: rowDetail.value?.title, subtitle: instanceId },
    () => delegate.getTransitionHistory!({ domain: domain.value, workflow: props.node.workflow, instanceId }),
  )
}

/** Fill a "{{dot.path}}" template from the row (for the detail tab subtitle). */
function fillTemplate(tpl: string, row: Record<string, unknown>): string {
  return tpl
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p: string) => {
      const v = getPath(row, p)
      return v == null ? '' : String(v)
    })
    .trim()
}

/** Row click → open the record's detail (its current-state view) in a new tab. */
function onRowClick(row: Record<string, unknown>): void {
  const rd = rowDetail.value
  if (!rd || !delegate.onAction) return
  const key = String(row.key ?? row.id ?? '')
  delegate.onAction('navigate', {
    key: rd.navigate,
    payload: {
      domain: domain.value,
      workflow: props.node.workflow,
      instanceId: row.id ?? row.key,
      // Tab title = the entity label; subtitle = a configured row template (else key).
      title: localizeLabel(rd.title, ctx.lang) || props.node.workflow,
      key,
      subtitle: rd.subtitle ? fillTemplate(rd.subtitle, row) : key,
    },
  })
}

// Per-row technical metadata (id/key/flow/…) — shown in a popup so it stays out
// of the business-facing columns. `metaRow` holds the row whose popup is open.
const metaRow = ref<Record<string, unknown> | null>(null)
const META_FIELDS: Array<{ k: string; label: { en: string; tr: string }; date?: boolean }> = [
  { k: 'id', label: { en: 'ID', tr: 'ID' } },
  { k: 'key', label: { en: 'Key', tr: 'Anahtar' } },
  { k: 'name', label: { en: 'Flow', tr: 'Akış' } },
  { k: 'flow', label: { en: 'Flow', tr: 'Akış' } },
  { k: 'flowVersion', label: { en: 'Version', tr: 'Sürüm' } },
  { k: 'domain', label: { en: 'Domain', tr: 'Alan' } },
  { k: 'createdAt', label: { en: 'Created', tr: 'Oluşturma' }, date: true },
  { k: 'modifiedAt', label: { en: 'Modified', tr: 'Değişiklik' }, date: true },
]
function metaItems(): Array<{ label: string; value: string }> {
  const r = metaRow.value
  if (!r) return []
  const out: Array<{ label: string; value: string }> = []
  const seen = new Set<string>()
  for (const f of META_FIELDS) {
    const v = r[f.k]
    if (v == null || v === '') continue
    const label = localizeLabel(f.label as never, ctx.lang)
    if (seen.has(label)) continue // 'name'/'flow' collapse to one "Flow" row
    seen.add(label)
    let value = String(v)
    if (f.date) {
      const d = new Date(String(v))
      if (!Number.isNaN(d.getTime())) value = d.toLocaleString(ctx.lang)
    }
    out.push({ label, value })
  }
  return out
}

/** The active sort direction on this column, or null if it isn't the sorted one. */
function sortState(c: InstanceColumn): 'asc' | 'desc' | null {
  const a = activeSort.value
  return c.sortField && a && a.field === c.sortField ? a.direction : null
}

/** Click a sortable header: toggle its direction, or start it descending. */
function toggleSort(c: InstanceColumn): void {
  if (!c.sortField || loading.value) return
  const cur = activeSort.value
  activeSort.value =
    cur && cur.field === c.sortField
      ? { field: c.sortField, direction: cur.direction === 'asc' ? 'desc' : 'asc' }
      : { field: c.sortField, direction: 'desc' }
  page.value = 1
}

/** Read a dot-path off the instance snapshot (e.g. "attributes.deviceId"). */
function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

function cell(row: Record<string, unknown>, c: InstanceColumn): string {
  if (!c.bind) return ''
  const v = getPath(row, c.bind)
  if (v == null) return ''
  if (c.format === 'datetime' || c.format === 'date') {
    const d = new Date(String(v))
    if (!Number.isNaN(d.getTime())) {
      return c.format === 'date' ? d.toLocaleDateString(ctx.lang) : d.toLocaleString(ctx.lang)
    }
  }
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** True for any column rendered as a pill (neutral "chip" or colored "status"). */
function isChip(c: InstanceColumn): boolean {
  return c.format === 'chip' || c.format === 'status'
}

/**
 * Semantic colour for the generic vNext instance-status enum, applied only to
 * "status"-format columns. Neutral for everything else (arbitrary business
 * states use "chip", which stays grey).
 */
function chipClass(row: Record<string, unknown>, c: InstanceColumn): string {
  if (c.format !== 'status' || !c.bind) return 'd-instancelist-chip'
  const s = String(getPath(row, c.bind) ?? '').toLowerCase()
  const tone =
    s === 'active' ? 'success' : s === 'busy' || s === 'faulted' ? 'danger' : 'muted'
  return `d-instancelist-chip d-instancelist-chip--${tone}`
}

async function load(): Promise<void> {
  if (!delegate.queryInstances) {
    log('error', 'InstanceList needs delegate.queryInstances, but none was provided', undefined, {
      source: 'InstanceList',
      workflow: `${domain.value}/${props.node.workflow}`,
    })
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const res = await delegate.queryInstances({
      domain: domain.value,
      workflow: props.node.workflow,
      ...(props.node.version ? { version: props.node.version } : {}),
      page: page.value,
      pageSize: pageSize.value,
      ...(effectiveFilter() !== undefined ? { filter: effectiveFilter() } : {}),
      ...(activeSort.value ? { sort: activeSort.value } : {}),
    })
    items.value = res.items ?? []
    hasNext.value = !!res.hasNext
    hasPrev.value = !!res.hasPrev
    lastPage.value = res.lastPage
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
    items.value = []
  } finally {
    loading.value = false
  }
}

function next(): void {
  if (hasNext.value && !loading.value) page.value += 1
}
function prev(): void {
  if (hasPrev.value && page.value > 1 && !loading.value) page.value -= 1
}
function first(): void {
  if (hasPrev.value && !loading.value) page.value = 1
}
function last(): void {
  if (lastPage.value && lastPage.value > page.value && !loading.value) page.value = lastPage.value
}

watch([page, activeSort, appliedFilters], () => void load())

onMounted(async () => {
  // A "state" filter offers the workflow's own states — fetch them once.
  if (columns.value.some((c) => filterType(c) === 'state') && delegate.getWorkflowStates) {
    try {
      workflowStates.value = await delegate.getWorkflowStates({
        domain: domain.value,
        workflow: props.node.workflow,
        ...(props.node.version ? { version: props.node.version } : {}),
      })
    } catch (e) {
      log('error', 'InstanceList could not load workflow states for the state filter', undefined, {
        source: 'InstanceList',
        workflow: `${domain.value}/${props.node.workflow}`,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  void load()
})
</script>

<template>
  <div class="d-instancelist">
    <div v-if="errorText" class="d-instancelist-error">{{ errorText }}</div>
    <table class="d-instancelist-table">
      <thead>
        <tr>
          <th
            v-for="(c, i) in columns"
            :key="i"
            class="d-instancelist-th"
            :class="{ 'd-instancelist-th--sortable': !!c.sortField }"
            :aria-sort="sortState(c) === 'asc' ? 'ascending' : sortState(c) === 'desc' ? 'descending' : undefined"
          >
            <span class="d-instancelist-th-inner">
              <span class="d-instancelist-th-label" @click="toggleSort(c)">
                {{ c.kind ? '' : colLabel(c) }}
                <span
                  v-if="c.sortField"
                  class="d-instancelist-sort"
                  :class="{ 'is-active': !!sortState(c) }"
                  >{{ sortState(c) === 'asc' ? '▲' : sortState(c) === 'desc' ? '▼' : '⇅' }}</span
                >
              </span>
              <button
                v-if="c.filter"
                type="button"
                class="d-instancelist-funnel"
                :class="{ 'is-active': isFiltered(c) }"
                aria-label="Filter"
                @click.stop="toggleFilter(c)"
              >
                <i class="pi pi-filter"></i>
              </button>
            </span>
            <div v-if="c.filter && openFilter === c.filter.field" class="d-instancelist-filterpop" @click.stop>
              <!-- Enum multi-select: status (built-in) or state (workflow's states) -->
              <div v-if="isEnum(c)" class="d-instancelist-filterchecks">
                <span v-if="!optionsFor(c).length" class="d-instancelist-filterempty">…</span>
                <label v-for="o in optionsFor(c)" :key="o.value" class="d-instancelist-check">
                  <input type="checkbox" :checked="isChecked(c, o.value)" @change="onToggle(c, o.value)" />
                  <span>{{ optLabel(o) }}</span>
                </label>
              </div>
              <!-- Date range: start + end (backend `between`) -->
              <template v-else-if="filterType(c) === 'daterange'">
                <input
                  type="date"
                  class="d-instancelist-filterdate"
                  :value="dateVal(c, 'from')"
                  :aria-label="uiText('list.filter.from')"
                  @change="onDate(c, 'from', ($event.target as HTMLInputElement).value)"
                />
                <span class="d-instancelist-filterdash">–</span>
                <input
                  type="date"
                  class="d-instancelist-filterdate"
                  :value="dateVal(c, 'to')"
                  :aria-label="uiText('list.filter.to')"
                  @change="onDate(c, 'to', ($event.target as HTMLInputElement).value)"
                />
              </template>
              <!-- Free-text search (default) -->
              <input
                v-else
                type="text"
                class="d-instancelist-filterinput"
                :value="textVal(c)"
                :placeholder="uiText('list.search')"
                @input="onTextInput(c, ($event.target as HTMLInputElement).value)"
              />
              <button
                v-if="isFiltered(c)"
                type="button"
                class="d-instancelist-filterclear"
                aria-label="Clear filter"
                @click="clearFilter(c)"
              >
                ×
              </button>
            </div>
          </th>
          <th class="d-instancelist-th d-instancelist-th--meta" aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading" class="d-instancelist-status">
          <td :colspan="columns.length + 1"><i class="pi pi-spinner pi-spin"></i></td>
        </tr>
        <tr v-else-if="!items.length" class="d-instancelist-status">
          <td :colspan="columns.length + 1">
            {{ uiText('list.noRecords') }}
          </td>
        </tr>
        <tr
          v-else
          v-for="(row, ri) in items"
          :key="(row.id as string) ?? ri"
          :class="{ 'd-instancelist-row--clickable': !!rowDetail }"
          @click="onRowClick(row)"
        >
          <td
            v-for="(c, ci) in columns"
            :key="ci"
            :class="{ 'd-instancelist-actioncell': !!c.kind }"
            :title="c.kind ? '' : cell(row, c)"
          >
            <button
              v-if="c.kind === 'action'"
              type="button"
              class="d-instancelist-action"
              @click.stop="runAction(c.action, row, c.label)"
            >
              {{ colLabel(c) }}
            </button>
            <span v-else-if="isChip(c)" :class="chipClass(row, c)">{{ cell(row, c) }}</span>
            <template v-else>{{ cell(row, c) }}</template>
          </td>
          <!-- Uniform per-row ⋯ menu (Details / Links / Actions / Transitions /
               System). Always present; composed from the node's own config. -->
          <td class="d-instancelist-metacell">
            <button
              type="button"
              class="d-instancelist-info"
              :class="{ 'is-open': openMenu?.id === `menu:${ri}` }"
              :title="uiText('list.menu.title')"
              :aria-label="uiText('list.menu.title')"
              @click.stop="toggleMenu(`menu:${ri}`, row, $event)"
            >
              <i class="pi pi-ellipsis-v"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="columns.length" class="d-instancelist-pager">
      <button type="button" :disabled="!hasPrev || loading" @click="first" aria-label="First page">«</button>
      <button type="button" :disabled="!hasPrev || loading" @click="prev" aria-label="Previous page">‹</button>
      <span class="d-instancelist-page">{{ lastPage ? `${page} / ${lastPage}` : page }}</span>
      <button type="button" :disabled="!hasNext || loading" @click="next" aria-label="Next page">›</button>
      <button
        v-if="lastPage"
        type="button"
        :disabled="page >= lastPage || loading"
        @click="last"
        aria-label="Last page"
      >
        »
      </button>
    </div>

    <!-- Per-row technical metadata popup (id / key / flow / dates). -->
    <div v-if="metaRow" class="d-raw-modal" @click.self="metaRow = null">
      <div class="d-raw-dialog d-raw-dialog--sm" role="dialog" aria-modal="true">
        <header class="d-raw-head">
          <span>{{ uiText('list.metadata.title') }}</span>
          <button type="button" class="d-raw-close" aria-label="Close" @click="metaRow = null">×</button>
        </header>
        <div class="d-hist">
          <dl class="d-detail">
            <template v-for="m in metaItems()" :key="m.label">
              <dt class="d-detail__key">{{ m.label }}</dt>
              <dd class="d-detail__val">{{ m.value }}</dd>
            </template>
          </dl>
        </div>
      </div>
    </div>

    <!-- Transition-history popup (row menu → History). Shared modal shell:
         config view / built-in fallback + a `{ }` raw-JSON toggle. -->
    <HistoryModal :history="history" :title="uiText('list.history.title')" :lang="ctx.lang" />

    <!-- Transition form (⋯ menu → a transition that needs input, e.g. update).
         The view is self-presenting (its own Dialog + buttons); we just bridge. -->
    <TransitionForm
      v-if="txForm"
      :view="txForm.view"
      :schema="txForm.schema"
      :validation-schema="txForm.validationSchema"
      :data="txForm.data"
      :lang="ctx.lang"
      @apply="onTxApply"
      @close="txForm = null"
    />

    <!-- Combo (menu) dropdown — teleported to body + fixed to the button rect so
         the table's overflow never clips it. -->
    <Teleport to="body">
      <template v-if="openMenu">
        <div class="d-menu-backdrop" @click="openMenu = null" @wheel="openMenu = null"></div>
        <div
          class="d-menu-pop"
          :style="{ top: openMenu.top + 'px', right: openMenu.right + 'px' }"
          @click.stop
        >
          <template v-for="(it, ii) in openMenu.items" :key="ii">
            <div v-if="it.heading" class="d-menu-heading">{{ localizeLabel(it.heading, ctx.lang) }}</div>
            <div v-else-if="it.loading" class="d-menu-loading">…</div>
            <div v-else-if="it.empty" class="d-menu-empty">{{ uiText('list.menu.noTransitions') }}</div>
            <button
              v-else
              type="button"
              class="d-menu-item"
              :class="{ 'd-menu-item--italic': it.italic, 'd-menu-item--tx': it.builtin === 'transition' }"
              @click="pickMenu(it, openMenu.row)"
            >
              {{ localizeLabel(it.label, ctx.lang) || it.action?.navigate }}
            </button>
          </template>
        </div>
      </template>
    </Teleport>
  </div>
</template>
