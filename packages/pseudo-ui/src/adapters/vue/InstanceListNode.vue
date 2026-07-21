<!--
  InstanceList node — a paged, read-only table of a workflow's instances. The HOST
  runs the query (delegate.queryInstances); pseudo-ui renders the table + pager and
  drives paging. The workflow + columns (which snapshot field + label) come from the
  backend view config, so one generic node serves any list (full table or slim
  summary). No solution-specific content lives here.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { InstanceColumn, InstanceListNode } from '../../engine/types'
import { localizeLabel } from '../../engine/expressionResolver'
import { useFormContext } from './useFormContext'
import { useDelegate } from './injection'

const props = defineProps<{ node: InstanceListNode }>()
const ctx = useFormContext()
const delegate = useDelegate()
const log = delegate.onLog ?? (() => {})

const columns = computed<InstanceColumn[]>(() => props.node.columns ?? [])

// Sort is view-driven: the default comes from the node's `sort` config; the user
// then re-sorts interactively by clicking a column whose config marks it sortable
// (`sortField`). No sort field is hard-coded here.
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
const activeSort = ref<SortSpec | undefined>(normalizeSort(props.node.sort))

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

function colLabel(c: InstanceColumn): string {
  return localizeLabel(c.label, ctx.lang) || c.bind || ''
}

/** Build the row-action navigation payload from the clicked row. */
function runAction(c: InstanceColumn, row: Record<string, unknown>): void {
  const a = c.action
  if (!a || !delegate.onAction) return
  const filter = (a.filter ?? [])
    .map((f) => {
      let value = getPath(row, f.valueFrom)
      // Optional: take the part after the first delimiter (e.g. scope from a
      // composite "{tckn}-{scope}" key). No delimiter → '' → entry dropped below.
      if (f.valueAfter != null && typeof value === 'string') {
        const i = value.indexOf(f.valueAfter)
        value = i >= 0 ? value.slice(i + f.valueAfter.length) : ''
      }
      return { field: f.field, operator: f.op ?? 'eq', value, isAttribute: !!f.isAttribute }
    })
    .filter((f) => f.value != null && f.value !== '')
  // Scalar copies (keyed by field) let the host use them for tab identity.
  const payload: Record<string, unknown> = { filter }
  for (const f of filter) payload[f.field] = f.value
  if (a.subtitle) payload.subtitle = fillTemplate(a.subtitle, row)
  delegate.onAction('navigate', { key: a.navigate, payload })
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
  const rd = props.node.rowDetail
  if (!rd || !delegate.onAction) return
  const key = String(row.key ?? row.id ?? '')
  delegate.onAction('navigate', {
    key: rd.navigate,
    payload: {
      domain: props.node.domain,
      workflow: props.node.workflow,
      instanceId: row.id ?? row.key,
      // Tab title = the entity label; subtitle = a configured row template (else key).
      title: localizeLabel(rd.title, ctx.lang) || props.node.workflow,
      key,
      subtitle: rd.subtitle ? fillTemplate(rd.subtitle, row) : key,
    },
  })
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
      workflow: `${props.node.domain}/${props.node.workflow}`,
    })
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const res = await delegate.queryInstances({
      domain: props.node.domain,
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
        domain: props.node.domain,
        workflow: props.node.workflow,
        ...(props.node.version ? { version: props.node.version } : {}),
      })
    } catch (e) {
      log('error', 'InstanceList could not load workflow states for the state filter', undefined, {
        source: 'InstanceList',
        workflow: `${props.node.domain}/${props.node.workflow}`,
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
                {{ c.kind === 'action' ? '' : colLabel(c) }}
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
                  :aria-label="ctx.lang.startsWith('tr') ? 'Başlangıç' : 'From'"
                  @change="onDate(c, 'from', ($event.target as HTMLInputElement).value)"
                />
                <span class="d-instancelist-filterdash">–</span>
                <input
                  type="date"
                  class="d-instancelist-filterdate"
                  :value="dateVal(c, 'to')"
                  :aria-label="ctx.lang.startsWith('tr') ? 'Bitiş' : 'To'"
                  @change="onDate(c, 'to', ($event.target as HTMLInputElement).value)"
                />
              </template>
              <!-- Free-text search (default) -->
              <input
                v-else
                type="text"
                class="d-instancelist-filterinput"
                :value="textVal(c)"
                :placeholder="ctx.lang.startsWith('tr') ? 'Ara…' : 'Search…'"
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
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading" class="d-instancelist-status">
          <td :colspan="columns.length || 1"><i class="pi pi-spinner pi-spin"></i></td>
        </tr>
        <tr v-else-if="!items.length" class="d-instancelist-status">
          <td :colspan="columns.length || 1">{{ ctx.lang.startsWith('tr') ? 'Kayıt yok' : 'No records' }}</td>
        </tr>
        <tr
          v-else
          v-for="(row, ri) in items"
          :key="(row.id as string) ?? ri"
          :class="{ 'd-instancelist-row--clickable': !!props.node.rowDetail }"
          @click="onRowClick(row)"
        >
          <td v-for="(c, ci) in columns" :key="ci" :title="c.kind === 'action' ? '' : cell(row, c)">
            <button
              v-if="c.kind === 'action'"
              type="button"
              class="d-instancelist-action"
              @click.stop="runAction(c, row)"
            >
              {{ colLabel(c) }}
            </button>
            <span v-else-if="isChip(c)" :class="chipClass(row, c)">{{ cell(row, c) }}</span>
            <template v-else>{{ cell(row, c) }}</template>
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
  </div>
</template>
