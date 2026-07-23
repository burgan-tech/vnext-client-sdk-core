<script setup lang="ts">
import { watch, onMounted, nextTick } from 'vue'
import type { DataSchema, ViewDefinition } from '../../engine/types'
import { createFormContext, provideFormContext } from './useFormContext'
import { useLookups } from './useLookups'
import { loadLovForField, isLovFilterAffectedByChanges } from './useLovLoader'
import { useDelegate } from './injection'
import DynamicRenderer from './DynamicRenderer.vue'

const props = defineProps<{
  schema: DataSchema
  view: ViewDefinition
  lang: string
  boundValues?: Record<string, unknown>
  boundInstanceValues?: Record<string, unknown>
  /** Separate schema for submit-time validation (labels still use `schema`). */
  validationSchema?: DataSchema | null
}>()

const emit = defineEmits<{
  (e: 'update', data: Record<string, unknown>): void
}>()

const delegate = useDelegate()
const log = delegate.onLog ?? (() => {})

log('debug', 'NestedComponent initializing', undefined, { source: 'NestedComponent', boundKeys: [...Object.keys(props.boundValues ?? {}), ...Object.keys(props.boundInstanceValues ?? {})] })

const ctx = createFormContext(props.schema, props.lang)
if (props.validationSchema) ctx.validationSchema = props.validationSchema
provideFormContext(ctx)

// Adopt a late-resolved schema in place (host may resolve the transition schema
// async, after mount) so x-labels + validation appear WITHOUT remounting the form
// — remounting would wipe user input and tear down the submit bridge.
watch(() => props.schema, (s) => { ctx.schema = s })

// Restrict submit-time validation to the fields this view actually binds, so a
// schema `required` field the view doesn't render (e.g. resolved via
// x-context-source / start attributes) can't block submit.
function collectBinds(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  const n = node as { bind?: unknown; children?: unknown[]; template?: unknown }
  if (typeof n.bind === 'string') {
    const top = n.bind.replace(/^\$(form|instance)\./, '').split('.')[0]
    if (top) out.add(top)
  }
  if (Array.isArray(n.children)) for (const c of n.children) collectBinds(c, out)
  if (n.template) collectBinds(n.template, out)
}
const bound = new Set<string>()
collectBinds(props.view.view, bound)
ctx.boundFields = bound

if (props.view.uiState) {
  Object.assign(ctx.uiState, props.view.uiState)
  log('info', 'Nested component UI state initialized', undefined, { keys: Object.keys(props.view.uiState) })
}

const allBound: Record<string, unknown> = {
  ...props.boundValues,
  ...props.boundInstanceValues,
}
Object.assign(ctx.params, allBound)
Object.assign(ctx.formData, allBound)
Object.assign(ctx.instanceData, allBound)

validateInputContract()

function validateInputContract() {
  if (!props.schema.properties) return
  const boundKeys = Object.keys(allBound)

  for (const [key, prop] of Object.entries(props.schema.properties)) {
    if (prop['x-binding'] === 'required' && !boundKeys.includes(key)) {
      log('warn', `Missing required input "${key}". Parent must bind this property.`, undefined, { source: 'Component', field: key })
    }
  }
}

watch(() => props.lang, (newLang) => {
  ctx.lang = newLang
})

watch(() => ctx.formData, (newData) => {
  emit('update', { ...newData })
}, { deep: true })

watch([() => props.boundValues, () => props.boundInstanceValues], ([formVals, instVals]) => {
  const merged = { ...formVals, ...instVals }
  const changedFields: string[] = []

  for (const [key, val] of Object.entries(merged)) {
    if (ctx.params[key] !== val) {
      changedFields.push(key)
      ctx.params[key] = val
      ctx.formData[key] = val
      ctx.instanceData[key] = val
    }
  }

  if (changedFields.length > 0) {
    reloadAffectedLovFields(changedFields)
  }
}, { deep: true })

function reloadAffectedLovFields(changedFields: string[]) {
  if (!props.schema.properties) return

  for (const [fieldName, prop] of Object.entries(props.schema.properties)) {
    const lov = prop['x-lov']
    if (!lov?.filter) continue

    if (isLovFilterAffectedByChanges(lov.filter, changedFields)) {
      ctx.formData[fieldName] = undefined
      loadLovForField(fieldName, ctx, delegate.requestData, log)
    }
  }
}

onMounted(async () => {
  if (!props.schema.properties) return
  for (const [fieldName, prop] of Object.entries(props.schema.properties)) {
    if (prop['x-lov']) {
      await loadLovForField(fieldName, ctx, delegate.requestData, log)
    }
  }

  nextTick(() => {
    if (props.view.lookups?.length) {
      log('debug', `NestedComponent initializing ${props.view.lookups.length} lookup(s)`, undefined, { source: 'NestedComponent', lookups: props.view.lookups })
      useLookups(props.view.lookups, ctx, delegate.requestData, log)
    }
  })
})
</script>

<template>
  <DynamicRenderer :node="view.view" />
</template>
