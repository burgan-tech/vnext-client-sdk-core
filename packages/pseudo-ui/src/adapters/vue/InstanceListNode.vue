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
const pageSize = computed(() =>
  typeof props.node.pageSize === 'number' && props.node.pageSize > 0 ? props.node.pageSize : 20,
)

const page = ref(1)
const items = ref<Record<string, unknown>[]>([])
const hasNext = ref(false)
const hasPrev = ref(false)
const loading = ref(false)
const errorText = ref('')

function colLabel(c: InstanceColumn): string {
  return localizeLabel(c.label, ctx.lang) || c.bind
}

/** Read a dot-path off the instance snapshot (e.g. "attributes.deviceId"). */
function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

function cell(row: Record<string, unknown>, c: InstanceColumn): string {
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
  if (c.format !== 'status') return 'd-instancelist-chip'
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
      ...(props.node.filter !== undefined ? { filter: props.node.filter } : {}),
      ...(props.node.sort !== undefined ? { sort: props.node.sort } : {}),
    })
    items.value = res.items ?? []
    hasNext.value = !!res.hasNext
    hasPrev.value = !!res.hasPrev
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

watch(page, () => void load())
onMounted(() => void load())
</script>

<template>
  <div class="d-instancelist">
    <div v-if="errorText" class="d-instancelist-error">{{ errorText }}</div>
    <table class="d-instancelist-table">
      <thead>
        <tr>
          <th v-for="(c, i) in columns" :key="i">{{ colLabel(c) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading" class="d-instancelist-status">
          <td :colspan="columns.length || 1"><i class="pi pi-spinner pi-spin"></i></td>
        </tr>
        <tr v-else-if="!items.length" class="d-instancelist-status">
          <td :colspan="columns.length || 1">{{ ctx.lang.startsWith('tr') ? 'Kayıt yok' : 'No records' }}</td>
        </tr>
        <tr v-else v-for="(row, ri) in items" :key="(row.id as string) ?? ri">
          <td v-for="(c, ci) in columns" :key="ci" :title="cell(row, c)">
            <span v-if="isChip(c)" :class="chipClass(row, c)">{{ cell(row, c) }}</span>
            <template v-else>{{ cell(row, c) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="columns.length" class="d-instancelist-pager">
      <button type="button" :disabled="!hasPrev || loading" @click="prev" aria-label="Previous">‹</button>
      <span class="d-instancelist-page">{{ page }}</span>
      <button type="button" :disabled="!hasNext || loading" @click="next" aria-label="Next">›</button>
    </div>
  </div>
</template>
