<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import type { ComponentNode, SchemaProperty, LovItem, ForEachNode, NestedComponentNode, NavigationNode, ActionDescriptor, CardNode, ButtonNode, TextNode, TabViewNode, MultiLangText, DataSchema, ViewDefinition } from '../../engine/types'
import { useFormContext } from './useFormContext'
import { resolveTextContent, resolveExpression, resolveMultiLang } from '../../engine/expressionResolver'
import { resolveNestedBind, applyNestedUpdate, getByPath, setByPath } from '../../engine/bindResolver'
import { getSchemaProperty, getFieldLabel, getEnumOptions, isFieldRequired, mapLovItemsToOptions, validateField, getArrayItemSchema } from '../../engine/schemaResolver'
import { evaluateConditional } from '../../engine/conditionalEngine'
import { dispatchAction } from '../../engine/actionPipeline'
import { useLovLoader } from './useLovLoader'
import { useDelegate, useOverlayTarget } from './injection'
import { useToast } from 'primevue/usetoast'
import NestedComponentWrapper from './NestedComponentWrapper.vue'
import ErrorBoundary from './ErrorBoundary.vue'
import DesignerNode from './DesignerNode.vue'

import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import DatePicker from 'primevue/datepicker'
import Card from 'primevue/card'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Divider from 'primevue/divider'
import Button from 'primevue/button'
import FloatLabel from 'primevue/floatlabel'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'
import PrimeSlider from 'primevue/slider'
import Chip from 'primevue/chip'
import ProgressSpinner from 'primevue/progressspinner'
import ProgressBar from 'primevue/progressbar'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import StepItem from 'primevue/stepitem'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import SelectButton from 'primevue/selectbutton'
import PrimeAutoComplete from 'primevue/autocomplete'
import Avatar from 'primevue/avatar'
import PrimeDialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import PrimeToolbar from 'primevue/toolbar'
import PrimeMenu from 'primevue/menu'
import PrimeCarousel from 'primevue/carousel'
import Tooltip from 'primevue/tooltip'

const vTooltip = Tooltip

const props = withDefaults(defineProps<{
  node: ComponentNode
  item?: Record<string, unknown>
  /**
   * RFC 6901 JSON Pointer of this node within the ViewDefinition, used by
   * designer mode to address nodes for select/move/delete. Defaults to the
   * root view pointer; recursive renders extend it per structural key.
   */
  path?: string
}>(), { path: '/view' })

const ctx = useFormContext()
const delegate = useDelegate()
const toast = useToast()
const log = delegate.onLog ?? (() => {})
const overlayTarget = useOverlayTarget()

// ContentOutlet: resolve the host-injected component (e.g. the router's active
// view) via the delegate. Null when the ref is unknown or no resolver is wired.
const hostOutlet = computed(() => {
  if (props.node.type !== 'ContentOutlet') return null
  const ref = String((props.node as { ref?: unknown }).ref ?? '')
  return (delegate.resolveHostComponent?.(ref) ?? null) as unknown
})

/**
 * Read/write `ctx.formData` honouring dotted bind paths so view JSON
 * `bind: "notifications.smsNotifications"` produces nested objects
 * (matching backend payload expectations) instead of literal flat keys.
 */
function readForm(formData: Record<string, unknown>, bind: string | undefined): unknown {
  if (!bind) return undefined
  if (bind.includes('.')) return getByPath(formData, bind.split('.'))
  return formData[bind]
}
function writeForm(formData: Record<string, unknown>, bind: string, value: unknown): void {
  if (bind.includes('.')) setByPath(formData, bind.split('.'), value)
  else formData[bind] = value
}

const SPACING: Record<string, string> = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
}

// --- Schema binding ---
// Note: NestedComponentNode.bind can be Record<string, string>; narrow to string only.
const bindField = computed(() => {
  const b = (props.node as { bind?: unknown }).bind
  return typeof b === 'string' ? b : undefined
})
const schemaProp = computed<SchemaProperty | undefined>(() => {
  if (!bindField.value) return undefined
  return getSchemaProperty(ctx.schema, bindField.value)
})
const fieldLabel = computed(() => getFieldLabel(schemaProp.value, ctx.lang))
const fieldRequired = computed(() => {
  if (!bindField.value) return false
  return isFieldRequired(ctx.schema, bindField.value, ctx.formData, ctx.instanceData, ctx.params)
})
const fieldError = computed(() => ctx.errors[bindField.value || ''] || null)

// --- Conditional visibility ---
// In designer mode, force `visible: true` so view.json editors can see
// fields that the live runtime would hide. `enabled` is preserved.
const conditionalState = computed(() =>
  evaluateConditional(
    schemaProp.value?.['x-conditional'],
    ctx.formData,
    ctx.instanceData,
    ctx.params,
    { forceVisible: !!ctx.designerMode },
  )
)

// --- Dropdown options (enum or LOV) ---
const dropdownOptions = computed(() => {
  if (!schemaProp.value) return []
  if (schemaProp.value.enum) {
    return getEnumOptions(schemaProp.value, ctx.lang)
  }
  if (schemaProp.value['x-lov'] && bindField.value && ctx.lovData[bindField.value]) {
    return mapLovItemsToOptions(ctx.lovData[bindField.value] ?? [])
  }
  return []
})

// --- Card selection state ---
function cardAction(): CardNode['action'] | undefined {
  const n = props.node as CardNode
  return n.action ?? n.onTap
}
const isCardSelected = computed(() => {
  const raw = cardAction()
  if (!raw) return false
  const first = Array.isArray(raw) ? raw[0] : raw
  if (!first || first.action !== 'select' || !first.bind) return false
  const itemValue = typeof first.value === 'string' && first.value.startsWith('$')
    ? resolveExpression(first.value, ctx, props.item)
    : first.value
  return readForm(ctx.formData, first.bind) === itemValue && itemValue !== undefined
})

// --- LOV loading ---
const { loading: lovLoading, setupWatch: setupLovWatch } = useLovLoader(
  bindField.value,
  ctx,
  delegate.requestData,
  log
)

// Watch for x-lov to appear on schemaProp — schema may arrive after the view
// mounts (parallel fetch), so onMounted alone would miss the initial load.
let lovWatchInitialized = false
watch(
  () => schemaProp.value?.['x-lov'],
  (lov) => {
    if (lov && !lovWatchInitialized) {
      lovWatchInitialized = true
      setupLovWatch()
    }
  },
  { immediate: true }
)

// --- ForEach data ---
// Designer mode: when source resolves to an empty array, return a single
// empty `$item` so editors see the template structure.
const forEachItems = computed<Record<string, unknown>[]>(() => {
  if (props.node.type !== 'ForEach') return []
  const feNode = props.node as ForEachNode
  const resolved = resolveExpression(feNode.source, ctx, props.item)
  const arr = Array.isArray(resolved) ? resolved as Record<string, unknown>[] : []
  if (ctx.designerMode && arr.length === 0) return [{}]
  return arr
})

// --- Navigation (Amorphie nav list) ---
const navigationItems = computed<Record<string, unknown>[]>(() => {
  if (props.node.type !== 'Navigation') return []
  const resolved = resolveExpression((props.node as NavigationNode).items, ctx, props.item)
  return Array.isArray(resolved) ? (resolved as Record<string, unknown>[]) : []
})

/** Localize a nav label: array [{language,label}] (preferred), { <lang>: text } map, or plain string. */
function navLabel(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  const base = (l: string) => (l || '').toLowerCase().split(/[-_]/)[0]
  if (Array.isArray(v)) {
    const want = base(ctx.lang || 'en')
    const list = v as Array<{ language?: string; label?: string }>
    const hit = list.find((e) => base(e.language ?? '') === want) ?? list[0]
    return hit?.label ?? ''
  }
  return resolveMultiLang(v as MultiLangText, ctx.lang)
}

/** Emit the navigation intent for a tapped nav item; the host maps it to its router. */
function onNavItem(item: Record<string, unknown>): void {
  void delegate.onAction?.('navigate', item)
}

// --- Nested component ---
const nestedSchema = ref<DataSchema | null>(null)
const nestedView = ref<ViewDefinition | null>(null)

onMounted(async () => {
  if (props.node.type === 'Component') {
    const ncNode = props.node as NestedComponentNode
    log('debug', `Loading nested component "${ncNode.ref}"`, undefined, { source: 'Component', ref: ncNode.ref })
    try {
      const result = await delegate.loadComponent(ncNode.ref)
      nestedSchema.value = result.schema
      nestedView.value = result.view
      log('info', `Nested component "${ncNode.ref}" loaded`, undefined, { source: 'Component', ref: ncNode.ref })
    } catch (e) {
      log('error', `Failed to load nested component: ${ncNode.ref}`, e, { source: 'Component', ref: ncNode.ref })
    }
  }
})

const boundValues = computed(() => {
  if (props.node.type !== 'Component') return undefined
  const ncNode = props.node as NestedComponentNode
  return resolveNestedBind(ncNode.bind, ctx)
})

function handleNestedUpdate(childData: Record<string, unknown>) {
  const ncNode = props.node as NestedComponentNode
  if (!ncNode.bind) return
  applyNestedUpdate(ncNode.bind, childData, ctx)
}

// --- Field value model ---
function getFieldValue() {
  return readForm(ctx.formData, bindField.value)
}

async function setFieldValue(value: unknown) {
  if (!bindField.value) return
  writeForm(ctx.formData, bindField.value, value)
  log('debug', `Field "${bindField.value}" = ${JSON.stringify(value)}`, undefined, { source: 'Field', field: bindField.value })

  const error = validateField(schemaProp.value, value, fieldRequired.value, ctx.lang)
  if (error) {
    ctx.errors[bindField.value] = error
    log('debug', `Validation error on "${bindField.value}": ${error}`, undefined, { source: 'Validation', field: bindField.value, error })
    return
  }

  if (schemaProp.value?.['x-validation'] && delegate.onValidationRequest) {
    const customError = await delegate.onValidationRequest(bindField.value, value, { ...ctx.formData })
    if (customError) {
      ctx.errors[bindField.value] = customError
      log('debug', `Custom validation error on "${bindField.value}": ${customError}`, undefined, { source: 'Validation', field: bindField.value, error: customError })
      return
    }
  }

  delete ctx.errors[bindField.value]
}

// --- ObjectField helpers ---
function resolveSubLabel(prop: SchemaProperty, key: string): string {
  return prop['x-labels'] ? resolveMultiLang(prop['x-labels'], ctx.lang) : key
}

function getNestedValue(subKey: string): unknown {
  if (!bindField.value) return ''
  return getByPath(ctx.formData as Record<string, unknown>, [bindField.value, subKey])
    ?? getByPath(ctx.instanceData as Record<string, unknown>, [bindField.value, subKey])
    ?? ''
}

// --- ArrayField helpers ---
const arrayItems = computed<unknown[]>(() => {
  if (props.node.type !== 'ArrayField') return []
  const val = getFieldValue()
  return Array.isArray(val) ? val : []
})

const arrayItemSchema = computed<SchemaProperty | undefined>(() => {
  if (!bindField.value) return undefined
  return getArrayItemSchema(ctx.schema, bindField.value)
})

const isObjectItemArray = computed<boolean>(() =>
  arrayItemSchema.value?.type === 'object' && !!arrayItemSchema.value.properties
)

function addArrayItem() {
  if (!bindField.value) return
  const current = Array.isArray(getFieldValue()) ? [...(getFieldValue() as unknown[])] : []
  if (isObjectItemArray.value && arrayItemSchema.value?.properties) {
    const blank: Record<string, unknown> = {}
    for (const [key, subProp] of Object.entries(arrayItemSchema.value.properties)) {
      if (subProp.default !== undefined) {
        blank[key] = subProp.default
      } else if (subProp.type === 'boolean') {
        blank[key] = false
      } else if (subProp.type === 'integer' || subProp.type === 'number') {
        blank[key] = null
      } else {
        blank[key] = ''
      }
    }
    current.push(blank)
  } else {
    const itemType = arrayItemSchema.value?.type
    if (itemType === 'integer' || itemType === 'number') {
      current.push(null)
    } else if (itemType === 'boolean') {
      current.push(false)
    } else {
      current.push('')
    }
  }
  setFieldValue(current)
}

function removeArrayItem(index: number) {
  if (!bindField.value) return
  const current = Array.isArray(getFieldValue()) ? [...(getFieldValue() as unknown[])] : []
  current.splice(index, 1)
  setFieldValue(current)
}

// --- Action handling ---
/**
 * Thin wrapper around the engine's `dispatchAction` pipeline. All
 * orchestration (array fanout, select/reset short-circuits, validation
 * gate, pre/post-hook execution) lives in
 * `engine/actionPipeline.ts`; the Vue adapter only injects
 * framework-specific writes via `applySelect` / `applyReset` /
 * `runValidation` and surfaces the validation-error toast.
 */
function handleAction(action: string | ActionDescriptor | ActionDescriptor[], command?: string): Promise<void> {
  return dispatchAction(action, {
    ctx,
    delegate,
    log,
    snapshotFormData: () => ({ ...ctx.formData }),
    applySelect: (descriptor) => {
      const resolvedValue =
        typeof descriptor.value === 'string' && (descriptor.value as string).startsWith('$')
          ? resolveExpression(descriptor.value as string, ctx, props.item)
          : descriptor.value
      const bind = descriptor.bind!
      if (bind.startsWith('$ui.')) ctx.uiState[bind.slice(4)] = resolvedValue
      else if (bind.startsWith('$form.')) writeForm(ctx.formData, bind.slice(6), resolvedValue)
      else writeForm(ctx.formData, bind, resolvedValue)
    },
    applyToggle: (descriptor) => {
      const bind = descriptor.bind!
      if (bind.startsWith('$ui.')) {
        const key = bind.slice(4)
        ctx.uiState[key] = !ctx.uiState[key]
      } else if (bind.startsWith('$form.')) {
        const key = bind.slice(6)
        writeForm(ctx.formData, key, !getByPath(ctx.formData, key.split('.')))
      }
    },
    applyReset: () => {
      for (const k of Object.keys(ctx.formData)) delete ctx.formData[k]
      for (const k of Object.keys(ctx.errors)) delete ctx.errors[k]
    },
    runValidation: () => {
      validateAllFields()
      if (Object.keys(ctx.errors).length === 0) return true
      const errorMessages = Object.values(ctx.errors).join(', ')
      toast.add({
        severity: 'warn',
        summary: ctx.lang === 'tr' ? 'Eksik veya hatalı alanlar var' : 'There are missing or invalid fields',
        detail: errorMessages,
        life: 5000,
      })
      return false
    },
  }, command, undefined, props.item)
}

function validateAllFields() {
  if (!ctx.schema.properties) return
  for (const [key, prop] of Object.entries(ctx.schema.properties)) {
    // Validation always uses the original visibility rules, even in designer
    // mode — a submit shouldn't surface errors for fields the original rules
    // hide. So no forceVisible here.
    const cond = evaluateConditional(prop['x-conditional'], ctx.formData, ctx.instanceData, ctx.params)
    if (!cond.visible) continue

    const req = isFieldRequired(ctx.schema, key, ctx.formData, ctx.instanceData, ctx.params)
    const error = validateField(prop, readForm(ctx.formData, key), req, ctx.lang)
    if (error) {
      ctx.errors[key] = error
    } else {
      delete ctx.errors[key]
    }
  }
}

// --- Helpers ---
function gapStyle(gap?: string) {
  return gap && SPACING[gap as string] ? { gap: SPACING[gap as string] } : {}
}

function alignmentClass(alignment?: string) {
  const map: Record<string, string> = {
    start: 'flex-start', center: 'center', end: 'flex-end',
    spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly',
    stretch: 'stretch',
  }
  return map[alignment as string] || undefined
}

const text = (content: string | MultiLangText | undefined) => resolveTextContent(content, ctx, props.item)

function resolveVisibility(expr?: unknown): boolean {
  if (typeof expr !== 'string') return false
  return !!resolveExpression(expr, ctx, props.item)
}

function setVisibility(expr: unknown, value: boolean) {
  if (typeof expr !== 'string') return
  if (expr.startsWith('$ui.')) {
    ctx.uiState[expr.slice(4)] = value
  } else if (expr.startsWith('$form.')) {
    writeForm(ctx.formData, expr.slice(6), value)
  }
}

const autoSuggestions = ref<string[]>([])
function searchAutoComplete(event: { query: string }) {
  if (!bindField.value || !ctx.lovData[bindField.value]) {
    autoSuggestions.value = []
    return
  }
  const q = event.query.toLowerCase()
  autoSuggestions.value = (ctx.lovData[bindField.value] ?? [])
    .filter(i => i.display.toLowerCase().includes(q))
    .map(i => i.display)
}

const menuRef = ref()
function toggleMenu(event: Event) {
  menuRef.value?.toggle(event)
}

function menuItems(items: any[]) {
  // Store the raw Material icon name on a custom field so the PrimeMenu #item
  // slot can render <i class="material-icons">{{ name }}</i>. We deliberately
  // do not set PrimeMenu's `icon` field — it emits `<span class={icon}/>`
  // which is incompatible with Material Icons' ligature model.
  return items.filter((it: any) => !it.divider && !it.header).map((it: any) => ({
    label: text(it.label),
    materialIcon: it.icon,
    disabled: it.disabled,
    command: () => it.action && handleAction(it.action),
  }))
}
</script>

<template>
  <DesignerNode :path="path" :node="node">
  <!-- === LAYOUT: Column === -->
  <div
    v-if="node.type === 'Column'"
    v-show="(node as any).visible === undefined || resolveVisibility((node as any).visible)"
    :class="['d-column', (node as any).class]"
    :style="{
      ...gapStyle(node.gap as string),
      justifyContent: alignmentClass(node.mainAxisAlignment as string),
      alignItems: alignmentClass(node.crossAxisAlignment as string) || 'stretch',
    }"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Row === -->
  <div
    v-else-if="node.type === 'Row'"
    class="d-row"
    :style="{
      ...gapStyle(node.gap as string),
      justifyContent: alignmentClass(node.mainAxisAlignment as string),
      alignItems: alignmentClass(node.crossAxisAlignment as string) || 'center',
    }"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Expanded === -->
  <div
    v-else-if="node.type === 'Expanded'"
    :style="{ flex: (node.flex as number) || 1, minWidth: 0 }"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: ScrollView === -->
  <div
    v-else-if="node.type === 'ScrollView'"
    class="d-scroll"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Center === -->
  <div
    v-else-if="node.type === 'Center'"
    class="d-center"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Wrap === -->
  <div
    v-else-if="node.type === 'Wrap'"
    class="d-wrap"
    :style="gapStyle(node.gap as string)"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Spacer === -->
  <div
    v-else-if="node.type === 'Spacer'"
    :style="{ flex: (node.flex as number) || 1 }"
  />

  <!-- === LAYOUT: Stack === -->
  <div
    v-else-if="node.type === 'Stack'"
    class="d-stack"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === LAYOUT: Grid === -->
  <div
    v-else-if="node.type === 'Grid'"
    class="d-grid"
    :style="{
      gridTemplateColumns: `repeat(${(node.columns as number) || 2}, 1fr)`,
      ...gapStyle(node.gap as string),
    }"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === CONTAINER: Card === -->
  <div
    v-else-if="node.type === 'Card'"
    class="d-card"
    :class="{
      'd-card--elevated': !node.variant || node.variant === 'elevated',
      'd-card--filled': node.variant === 'filled',
      'd-card--outlined': node.variant === 'outlined',
      'cursor-pointer': !!cardAction(),
      'd-card--selected': isCardSelected
    }"
    @click="cardAction() ? handleAction(cardAction()!) : undefined"
  >
    <Card>
      <template #content>
        <DynamicRenderer
          v-for="(child, i) in node.children"
          :key="i"
          :node="child"
          :item="item"
          :path="`${path}/children/${i}`"
        />
      </template>
    </Card>
  </div>

  <!-- === CONTAINER: Divider === -->
  <Divider v-else-if="node.type === 'Divider'" />

  <!-- === INPUT: TextField === -->
  <template v-else-if="node.type === 'TextField'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <InputText
          :id="bindField"
          :model-value="(getFieldValue() as string) || ''"
          @update:model-value="setFieldValue($event)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: TextArea === -->
  <template v-else-if="node.type === 'TextArea'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <Textarea
          :id="bindField"
          :model-value="(getFieldValue() as string) || ''"
          @update:model-value="setFieldValue($event)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          rows="3"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: NumberField === -->
  <template v-else-if="node.type === 'NumberField'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <InputNumber
          :id="bindField"
          :model-value="(getFieldValue() as number) ?? null"
          @update:model-value="setFieldValue($event)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          :min="schemaProp?.minimum"
          :max="schemaProp?.maximum"
          :use-grouping="true"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: Dropdown === -->
  <template v-else-if="node.type === 'Dropdown'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <Select
          :id="bindField"
          :append-to="overlayTarget"
          :model-value="getFieldValue()"
          @update:model-value="setFieldValue($event)"
          :options="dropdownOptions"
          option-label="label"
          option-value="value"
          :disabled="!conditionalState.enabled"
          :loading="lovLoading"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: Checkbox === -->
  <template v-else-if="node.type === 'Checkbox'">
    <div v-if="conditionalState.visible" class="d-field d-checkbox">
      <Checkbox
        :input-id="bindField"
        :model-value="!!getFieldValue()"
        @update:model-value="setFieldValue($event)"
        :disabled="!conditionalState.enabled"
        :binary="true"
        :invalid="!!fieldError"
        :aria-required="fieldRequired"
        :aria-label="fieldLabel"
      />
      <label :for="bindField" class="checkbox-label">{{ fieldLabel }}</label>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: RadioGroup === -->
  <template v-else-if="node.type === 'RadioGroup'">
    <div v-if="conditionalState.visible" class="d-field">
      <label class="field-group-label">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      <div class="d-radio-group" role="radiogroup" :aria-label="fieldLabel">
        <div
          v-for="opt in getEnumOptions(schemaProp, ctx.lang)"
          :key="opt.value"
          class="d-radio-item"
        >
          <RadioButton
            :input-id="`${bindField}-${opt.value}`"
            :model-value="getFieldValue()"
            @update:model-value="setFieldValue($event)"
            :value="opt.value"
            :disabled="!conditionalState.enabled"
          />
          <label :for="`${bindField}-${opt.value}`">{{ opt.label }}</label>
        </div>
      </div>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: DatePicker === -->
  <template v-else-if="node.type === 'DatePicker'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <DatePicker
          :id="bindField"
          :append-to="overlayTarget"
          :model-value="getFieldValue() ? new Date(getFieldValue() as string) : null"
          @update:model-value="setFieldValue($event ? ($event as Date).toISOString().split('T')[0] : null)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          date-format="dd/mm/yy"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: Switch === -->
  <template v-else-if="node.type === 'Switch'">
    <div v-if="conditionalState.visible" class="d-field d-switch">
      <ToggleSwitch
        :model-value="!!getFieldValue()"
        @update:model-value="setFieldValue($event)"
        :disabled="!conditionalState.enabled"
        :aria-label="fieldLabel"
      />
      <label class="switch-label">{{ fieldLabel }}</label>
    </div>
  </template>

  <!-- === INPUT: Slider === -->
  <template v-else-if="node.type === 'Slider'">
    <div v-if="conditionalState.visible" class="d-field">
      <label class="field-group-label">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span> — {{ getFieldValue() ?? 0 }}</label>
      <PrimeSlider
        :model-value="(getFieldValue() as number) ?? 0"
        @update:model-value="setFieldValue($event)"
        :min="schemaProp?.minimum ?? 0"
        :max="schemaProp?.maximum ?? 100"
        :disabled="!conditionalState.enabled"
        :aria-label="fieldLabel"
      />
    </div>
  </template>

  <!-- === INPUT: TimePicker === -->
  <template v-else-if="node.type === 'TimePicker'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <DatePicker
          :id="bindField"
          :append-to="overlayTarget"
          :model-value="getFieldValue() ? new Date(`1970-01-01T${getFieldValue()}`) : null"
          @update:model-value="setFieldValue($event ? `${String(($event as Date).getHours()).padStart(2,'0')}:${String(($event as Date).getMinutes()).padStart(2,'0')}` : null)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          time-only
          :hour-format="((node as any).hourFormat === '12') ? '12' : '24'"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: SegmentedButton === -->
  <template v-else-if="node.type === 'SegmentedButton'">
    <div v-if="conditionalState.visible" class="d-field">
      <label class="field-group-label">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      <SelectButton
        :model-value="getFieldValue()"
        @update:model-value="setFieldValue($event)"
        :options="dropdownOptions.length ? dropdownOptions : getEnumOptions(schemaProp, ctx.lang)"
        option-label="label"
        option-value="value"
        :disabled="!conditionalState.enabled"
        :multiple="!!(node as any).multiSelect"
        :aria-label="fieldLabel"
      />
    </div>
  </template>

  <!-- === INPUT: SearchField === -->
  <template v-else-if="node.type === 'SearchField'">
    <div v-if="conditionalState.visible" class="d-field d-search-field">
      <FloatLabel variant="on">
        <InputText
          :id="bindField"
          :model-value="(getFieldValue() as string) || ''"
          @update:model-value="setFieldValue($event)"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          role="searchbox"
          fluid
        />
        <label :for="bindField"><i class="pi pi-search" style="margin-right: 0.25rem"></i>{{ fieldLabel }}</label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === INPUT: AutoComplete === -->
  <template v-else-if="node.type === 'AutoComplete'">
    <div v-if="conditionalState.visible" class="d-field">
      <FloatLabel variant="on">
        <PrimeAutoComplete
          :id="bindField"
          :model-value="(getFieldValue() as string) || ''"
          @update:model-value="setFieldValue($event)"
          :suggestions="autoSuggestions"
          @complete="searchAutoComplete"
          :disabled="!conditionalState.enabled"
          :invalid="!!fieldError"
          :aria-required="fieldRequired"
          :aria-invalid="!!fieldError"
          :aria-label="fieldLabel"
          :min-length="(node as any).minLength ?? 1"
          fluid
        />
        <label :for="bindField">{{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span></label>
      </FloatLabel>
      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === DISPLAY: Image === -->
  <img
    v-else-if="node.type === 'Image'"
    :src="String(node.source || '')"
    :style="(`object-fit: ${(node.fit as string) || 'cover'}; max-width: 100%` as any)"
    class="d-image"
  />

  <!-- === DISPLAY: Chip === -->
  <Chip v-else-if="node.type === 'Chip'">
    <i v-if="(node as any).icon" class="material-icons p-chip-icon">{{ (node as any).icon }}</i>
    <span class="p-chip-text">{{ text((node as any).label) }}</span>
  </Chip>

  <!-- === DISPLAY: Badge (wraps child) === -->
  <template v-else-if="node.type === 'Badge'">
    <div class="d-badge-wrapper" style="position: relative; display: inline-flex;">
      <DynamicRenderer
        v-for="(child, i) in node.children"
        :key="i"
        :node="child"
        :item="item"
        :path="`${path}/children/${i}`"
      />
      <span class="d-badge-value">{{ text((node as any).content) }}</span>
    </div>
  </template>

  <!-- === DISPLAY: ProgressIndicator === -->
  <template v-else-if="node.type === 'ProgressIndicator'">
    <ProgressSpinner v-if="!node.variant || node.variant === 'circular'" style="width: 40px; height: 40px" />
    <ProgressBar v-else mode="indeterminate" style="height: 4px" />
  </template>

  <!-- === DISPLAY: ListTile === -->
  <div
    v-else-if="node.type === 'ListTile'"
    class="d-list-tile"
    :class="{ 'cursor-pointer': !!(node as any).onTap }"
    @click="(node as any).onTap ? handleAction((node as any).onTap) : undefined"
  >
    <div v-if="(node as any).leading" class="d-list-tile__leading">
      <DynamicRenderer :node="(node as any).leading" :item="item" :path="`${path}/leading`" />
    </div>
    <div class="d-list-tile__content">
      <span class="d-list-tile__title">{{ text((node as any).title) }}</span>
      <span v-if="(node as any).subtitle" class="d-list-tile__subtitle">{{ text((node as any).subtitle) }}</span>
    </div>
    <div v-if="(node as any).trailing" class="d-list-tile__trailing">
      <DynamicRenderer :node="(node as any).trailing" :item="item" :path="`${path}/trailing`" />
    </div>
  </div>

  <!-- === DISPLAY: Avatar === -->
  <Avatar
    v-else-if="node.type === 'Avatar'"
    :image="(node as any).source || undefined"
    :label="(node as any).label && !(node as any).icon ? text((node as any).label)?.charAt(0) : undefined"
    :shape="(node as any).shape === 'square' ? 'square' : 'circle'"
    :size="(node as any).size === 'xl' ? 'xlarge' : (node as any).size === 'lg' ? 'large' : (node as any).size === 'sm' ? undefined : undefined"
    :class="`d-avatar--${(node as any).size || 'md'}`"
  >
    <i v-if="(node as any).icon" class="material-icons">{{ (node as any).icon }}</i>
    <i v-else-if="!(node as any).source && !(node as any).label" class="material-icons">person</i>
  </Avatar>

  <!-- === DISPLAY: RichText === -->
  <p v-else-if="node.type === 'RichText'" class="d-richtext">
    <template v-for="(span, i) in ((node as any).spans || [])" :key="i">
      <a
        v-if="span.link"
        :href="span.link"
        target="_blank"
        :class="['d-richtext-span', { 'font-bold': span.bold, 'font-italic': span.italic }]"
        :style="span.variant ? `font-size: var(--d-text-${span.variant}-size, inherit)` : ''"
      >{{ text(span.text) }}</a>
      <span
        v-else
        :class="['d-richtext-span', { 'font-bold': span.bold, 'font-italic': span.italic }]"
        :style="span.variant ? `font-size: var(--d-text-${span.variant}-size, inherit)` : ''"
      >{{ text(span.text) }}</span>
    </template>
  </p>

  <!-- === DISPLAY: LoadingIndicator === -->
  <ProgressSpinner
    v-else-if="node.type === 'LoadingIndicator'"
    style="width: 32px; height: 32px"
  />

  <!-- === DISPLAY: Text === -->
  <component
    v-else-if="node.type === 'Text'"
    :is="(node.variant as string)?.startsWith('display') || (node.variant as string)?.startsWith('headline') ? 'h2' : (node.variant as string)?.startsWith('title') ? 'h3' : 'span'"
    :class="['d-text', `d-text--${node.variant || 'bodyMedium'}`]"
  >
    {{ text((node as TextNode).content) }}
  </component>

  <!-- === DISPLAY: Icon === -->
  <i
    v-else-if="node.type === 'Icon'"
    class="material-icons"
    :class="`d-icon--${(node.size as string) || 'md'}`"
  >
    {{ node.name }}
  </i>

  <!-- === ACTION: Button === -->
  <Button
    v-else-if="node.type === 'Button'"
    :severity="(node.variant === 'filled' || !node.variant) ? undefined : 'secondary'"
    :outlined="node.variant === 'outlined'"
    :text="node.variant === 'text'"
    @click="handleAction((node as ButtonNode).action, (node as ButtonNode).command)"
  >
    <template v-if="(node as ButtonNode).icon" #icon>
      <i class="material-icons">{{ (node as ButtonNode).icon }}</i>
    </template>
    {{ text((node as ButtonNode).label) }}
  </Button>

  <!-- === ACTION: IconButton === -->
  <Button
    v-else-if="node.type === 'IconButton'"
    rounded
    text
    @click="handleAction((node as any).action)"
  >
    <i class="material-icons">{{ node.icon }}</i>
  </Button>

  <!-- === ACTION: FAB === -->
  <Button
    v-else-if="node.type === 'FAB'"
    rounded
    raised
    :class="[
      'p-button-rounded',
      (node as any).variant === 'small' ? 'd-fab--small' : (node as any).variant === 'large' ? 'd-fab--large' : ''
    ]"
    @click="handleAction((node as any).action)"
  >
    <i class="material-icons">{{ node.icon }}</i>
    <span v-if="(node as any).label" style="margin-left: 0.5rem">{{ text((node as any).label) }}</span>
  </Button>

  <!-- === FIELD: ObjectField (object type auto-expand) === -->
  <template v-else-if="node.type === 'ObjectField'">
    <div v-if="conditionalState.visible && schemaProp?.properties" class="d-object-field">
      <div
        v-for="(subProp, subKey) in schemaProp.properties"
        :key="subKey"
        class="d-field"
      >
        <template v-if="conditionalState.enabled">
          <DynamicRenderer
            :node="{
              type: subProp.type === 'integer' || subProp.type === 'number' ? 'NumberField' : 'TextField',
              bind: `${bindField}.${subKey}`
            }"
            :item="item"
            :path="path"
          />
        </template>
        <template v-else>
          <label class="d-label">{{ resolveSubLabel(subProp, String(subKey)) }}</label>
          <span class="d-value">{{ getNestedValue(String(subKey)) }}</span>
        </template>
      </div>
    </div>
  </template>

  <!-- === FIELD: ArrayField (array type auto-expand) === -->
  <template v-else-if="node.type === 'ArrayField'">
    <div v-if="conditionalState.visible" class="d-array-field">

      <div class="d-array-field__header">
        <label class="d-label">
          {{ fieldLabel }}<span v-if="fieldRequired" class="required-mark"> *</span>
        </label>
        <Button v-if="conditionalState.enabled" icon="pi pi-plus" text size="small"
          :aria-label="fieldLabel ? `Add ${fieldLabel} item` : 'Add item'"
          @click="addArrayItem()" />
      </div>

      <div v-if="arrayItems.length === 0" class="d-array-field__empty">—</div>

      <!-- Object item array (ör. emails[]) -->
      <template v-if="isObjectItemArray">
        <div v-for="(arrItem, idx) in arrayItems" :key="idx"
          class="d-array-item d-array-item--object">
          <div class="d-array-item__header">
            <span class="d-array-item__index">{{ idx + 1 }}</span>
            <Button v-if="conditionalState.enabled" icon="pi pi-trash" text
              severity="danger" size="small" :aria-label="`Remove item ${idx + 1}`"
              @click="removeArrayItem(idx)" />
          </div>
          <div v-for="(subProp, subKey) in arrayItemSchema?.properties"
            :key="subKey" class="d-field">
            <template v-if="conditionalState.enabled">
              <DynamicRenderer
                :node="{
                  type: subProp.type === 'integer' || subProp.type === 'number'
                    ? 'NumberField'
                    : subProp.type === 'boolean' ? 'Switch' : 'TextField',
                  bind: `${bindField}.${idx}.${subKey}`
                }"
                :item="arrItem as Record<string, unknown>"
              />
            </template>
            <template v-else>
              <label class="d-label">{{ resolveSubLabel(subProp, String(subKey)) }}</label>
              <span class="d-value">
                {{ getByPath(arrItem as Record<string, unknown>, [String(subKey)]) ?? '' }}
              </span>
            </template>
          </div>
        </div>
      </template>

      <!-- Primitive item array (ör. string[], number[]) -->
      <template v-else>
        <div v-for="(_, idx) in arrayItems" :key="idx"
          class="d-array-item d-array-item--primitive">
          <template v-if="conditionalState.enabled">
            <DynamicRenderer
              :node="{
                type: arrayItemSchema?.type === 'integer' || arrayItemSchema?.type === 'number'
                  ? 'NumberField' : 'TextField',
                bind: `${bindField}.${idx}`
              }"
              :item="undefined"
            />
            <Button icon="pi pi-times" text severity="danger" size="small"
              :aria-label="`Remove item ${idx + 1}`"
              @click="removeArrayItem(idx)" />
          </template>
          <template v-else>
            <span class="d-value">{{ arrayItems[idx] }}</span>
          </template>
        </div>
      </template>

      <small v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</small>
    </div>
  </template>

  <!-- === CONTROL: ForEach === -->
  <ErrorBoundary v-else-if="node.type === 'ForEach'" label="ForEach">
    <template v-for="(forItem, i) in forEachItems" :key="i">
      <DynamicRenderer
        :node="(node as ForEachNode).template"
        :item="forItem"
        :path="`${path}/template`"
      />
    </template>
  </ErrorBoundary>

  <!-- === CONTROL: Navigation (Amorphie nav list, emits navigate intent) === -->
  <nav v-else-if="node.type === 'Navigation'" class="d-navigation">
    <template v-for="(navIt, i) in navigationItems" :key="(navIt.key as string) ?? i">
      <div v-if="navIt.type === 'group'" class="d-nav-group">
        <div class="d-nav-group__title">{{ navLabel(navIt.title) }}</div>
        <button
          v-for="child in ((navIt.children as Record<string, unknown>[]) ?? [])"
          :key="child.key as string"
          class="d-nav-item d-nav-item--child"
          @click="onNavItem(child)"
        >{{ navLabel(child.title) || child.key }}</button>
      </div>
      <hr v-else-if="navIt.type === 'divider'" class="d-nav-divider" />
      <button
        v-else-if="navIt.key"
        class="d-nav-item"
        @click="onNavItem(navIt)"
      >{{ navLabel(navIt.title) || navIt.key }}</button>
    </template>
  </nav>

  <!-- === CONTROL: Component (nested) === -->
  <ErrorBoundary v-else-if="node.type === 'Component'" :label="(node as NestedComponentNode).ref">
    <div class="d-nested">
      <NestedComponentWrapper
        v-if="nestedSchema && nestedView"
        :schema="nestedSchema"
        :view="nestedView"
        :lang="ctx.lang"
        :bound-values="boundValues?.form"
        :bound-instance-values="boundValues?.instance"
        @update="handleNestedUpdate"
      />
      <div v-else class="d-loading">
        <i class="pi pi-spinner pi-spin"></i>
        Loading {{ (node as NestedComponentNode).ref }}...
      </div>
    </div>
  </ErrorBoundary>

  <!-- === CONTROL: ContentOutlet (host-injected content, e.g. router active view) === -->
  <template v-else-if="node.type === 'ContentOutlet'">
    <component :is="hostOutlet" v-if="hostOutlet" />
    <div v-else class="d-outlet-empty">outlet "{{ String((node as ComponentNode).ref) }}" — no host component</div>
  </template>

  <!-- === CONTAINER: TabView === -->
  <Tabs v-else-if="node.type === 'TabView'" :value="0">
    <TabList>
      <Tab
        v-for="(tab, i) in (node as TabViewNode).tabs"
        :key="i"
        :value="i"
      >
        <i v-if="tab.icon" class="material-icons" style="margin-right: 0.5rem">{{ tab.icon }}</i>
        {{ text(tab.title) }}
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel
        v-for="(tab, i) in (node as TabViewNode).tabs"
        :key="i"
        :value="i"
      >
        <div class="d-tab-content">
          <DynamicRenderer
            v-for="(child, j) in tab.content"
            :key="j"
            :node="child"
            :item="item"
            :path="`${path}/tabs/${i}/content/${j}`"
          />
        </div>
      </TabPanel>
    </TabPanels>
  </Tabs>

  <!-- === CONTAINER: ExpansionPanel === -->
  <Accordion v-else-if="node.type === 'ExpansionPanel'">
    <AccordionPanel :value="'panel'">
      <AccordionHeader>{{ text((node as any).title) }}</AccordionHeader>
      <AccordionContent>
        <div class="d-expansion-content">
          <DynamicRenderer
            v-for="(child, i) in node.children"
            :key="i"
            :node="child"
            :item="item"
            :path="`${path}/children/${i}`"
          />
        </div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>

  <!-- === CONTAINER: Stepper === -->
  <Stepper v-else-if="node.type === 'Stepper'" :value="0" linear>
    <StepList>
      <StepItem v-for="(step, i) in ((node as any).steps || [])" :key="i" :value="i">
        {{ text(step.title) }}
      </StepItem>
    </StepList>
    <StepPanels>
      <StepPanel v-for="(step, i) in ((node as any).steps || [])" :key="i" :value="i">
        <div class="d-step-content">
          <DynamicRenderer
            v-for="(child, j) in step.content"
            :key="j"
            :node="child"
            :item="item"
            :path="`${path}/steps/${i}/content/${j}`"
          />
        </div>
      </StepPanel>
    </StepPanels>
  </Stepper>

  <!-- === SURFACE: Dialog === -->
  <PrimeDialog
    v-else-if="node.type === 'Dialog'"
    :append-to="overlayTarget"
    :visible="resolveVisibility(node.visible)"
    @update:visible="setVisibility(node.visible, $event)"
    :modal="true"
    :closable="(node as any).dismissible !== false"
    :header="text((node as any).title)"
  >
    <template v-if="(node as any).icon" #header>
      <div class="d-dialog-header">
        <i class="material-icons">{{ (node as any).icon }}</i>
        <span>{{ text((node as any).title) }}</span>
      </div>
    </template>
    <div class="d-dialog-body">
      <DynamicRenderer
        v-for="(child, i) in node.children"
        :key="i"
        :node="child"
        :item="item"
        :path="`${path}/children/${i}`"
      />
    </div>
    <template v-if="(node as any).actions?.length" #footer>
      <DynamicRenderer
        v-for="(child, i) in (node as any).actions"
        :key="i"
        :node="child"
        :item="item"
        :path="`${path}/actions/${i}`"
      />
    </template>
  </PrimeDialog>

  <!-- === SURFACE: BottomSheet === -->
  <Drawer
    v-else-if="node.type === 'BottomSheet'"
    :append-to="overlayTarget"
    :visible="resolveVisibility(node.visible)"
    @update:visible="setVisibility(node.visible, $event)"
    position="bottom"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </Drawer>

  <!-- === SURFACE: SideSheet === -->
  <Drawer
    v-else-if="node.type === 'SideSheet'"
    :append-to="overlayTarget"
    :visible="resolveVisibility(node.visible)"
    @update:visible="setVisibility(node.visible, $event)"
    position="right"
    :header="text((node as any).title)"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </Drawer>

  <!-- === SURFACE: Snackbar === -->
  <div
    v-else-if="node.type === 'Snackbar'"
    class="d-snackbar"
    :class="`d-snackbar--${(node as any).variant || 'standard'}`"
  >
    <span class="d-snackbar__text">{{ text((node as any).content) }}</span>
    <Button
      v-if="(node as any).action"
      :label="text(((node as any).action as ActionDescriptor)?.action)"
      text
      size="small"
      @click="(node as any).action && handleAction((node as any).action)"
    />
  </div>

  <!-- === SURFACE: Tooltip === -->
  <div
    v-else-if="node.type === 'Tooltip'"
    v-tooltip.top="text((node as any).content)"
    style="display: inline-flex"
  >
    <DynamicRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :item="item"
      :path="`${path}/children/${i}`"
    />
  </div>

  <!-- === NAVIGATION: AppBar === -->
  <PrimeToolbar v-else-if="node.type === 'AppBar'" class="d-appbar">
    <template #start>
      <div v-if="(node as any).leading" class="d-appbar__leading">
        <DynamicRenderer :node="(node as any).leading" :item="item" :path="`${path}/leading`" />
      </div>
      <span class="d-appbar__title">{{ text((node as any).title) }}</span>
    </template>
    <template #end>
      <div v-if="(node as any).actions" class="d-appbar__actions">
        <DynamicRenderer
          v-for="(child, i) in (node as any).actions"
          :key="i"
          :node="child"
          :item="item"
          :path="`${path}/actions/${i}`"
        />
      </div>
    </template>
  </PrimeToolbar>

  <!-- === NAVIGATION: NavigationBar === -->
  <div v-else-if="node.type === 'NavigationBar'" class="d-nav-bar">
    <div
      v-for="(dest, i) in ((node as any).destinations || [])"
      :key="i"
      class="d-nav-bar__item"
      :class="{ 'd-nav-bar__item--active': getFieldValue() === dest.value }"
      @click="setFieldValue(dest.value)"
    >
      <i class="material-icons">{{ getFieldValue() === dest.value && dest.selectedIcon ? dest.selectedIcon : dest.icon }}</i>
      <span>{{ text(dest.label) }}</span>
    </div>
  </div>

  <!-- === NAVIGATION: NavigationDrawer === -->
  <Drawer
    v-else-if="node.type === 'NavigationDrawer'"
    :append-to="overlayTarget"
    :visible="resolveVisibility(node.visible)"
    @update:visible="setVisibility(node.visible, $event)"
    position="left"
  >
    <template v-if="(node as any).header" #header>
      <DynamicRenderer :node="(node as any).header" :item="item" :path="`${path}/header`" />
    </template>
    <div class="d-nav-drawer">
      <template v-for="(navItem, i) in ((node as any).items || [])" :key="i">
        <Divider v-if="navItem.divider" />
        <div v-else-if="navItem.header" class="d-nav-drawer__header">{{ text(navItem.header) }}</div>
        <div
          v-else
          class="d-nav-drawer__item"
          @click="navItem.action && handleAction(navItem.action)"
        >
          <i v-if="navItem.icon" class="material-icons">{{ navItem.icon }}</i>
          <span>{{ text(navItem.label) }}</span>
          <span v-if="navItem.badge" class="d-nav-drawer__badge">{{ text(navItem.badge) }}</span>
        </div>
      </template>
    </div>
  </Drawer>

  <!-- === ACTION: Menu === -->
  <template v-else-if="node.type === 'Menu'">
    <div style="display: inline-flex">
      <div v-if="(node as any).anchor" @click="toggleMenu($event)">
        <DynamicRenderer :node="(node as any).anchor" :item="item" :path="`${path}/anchor`" />
      </div>
      <Button v-else text rounded @click="toggleMenu($event)">
        <i class="material-icons">more_vert</i>
      </Button>
    </div>
    <PrimeMenu
      ref="menuRef"
      :model="menuItems(((node as any).items || []))"
      :popup="true"
    >
      <template #item="{ item, props }">
        <a v-bind="props.action">
          <i v-if="(item as any).materialIcon" class="material-icons p-menuitem-icon">{{ (item as any).materialIcon }}</i>
          <span class="p-menuitem-text">{{ item.label }}</span>
        </a>
      </template>
    </PrimeMenu>
  </template>

  <!-- === ACTION: Toolbar === -->
  <PrimeToolbar v-else-if="node.type === 'Toolbar'" class="d-toolbar">
    <template #center>
      <div class="d-toolbar__content">
        <DynamicRenderer
          v-for="(child, i) in node.children"
          :key="i"
          :node="child"
          :item="item"
          :path="`${path}/children/${i}`"
        />
      </div>
    </template>
  </PrimeToolbar>

  <!-- === DISPLAY: Carousel === -->
  <template v-else-if="node.type === 'Carousel'">
    <PrimeCarousel
      :value="Array.isArray(resolveExpression((node as any).source, ctx, item)) ? (resolveExpression((node as any).source, ctx, item) as any[]) : []"
      :num-visible="1"
      :num-scroll="1"
      :show-indicators="(node as any).showIndicators !== false"
      :circular="!!(node as any).autoPlay"
      :autoplay-interval="(node as any).autoPlay ? 3000 : 0"
    >
      <template #item="{ data }">
        <DynamicRenderer :node="(node as any).template" :item="data" :path="`${path}/template`" />
      </template>
    </PrimeCarousel>
  </template>

  <!-- === FALLBACK === -->
  <Message v-else severity="warn" :closable="false">
    Unknown component type: {{ node.type }}
  </Message>
  </DesignerNode>
</template>

<style scoped>
/* Navigation (Amorphie nav list) */
.d-navigation { display: flex; flex-direction: column; gap: .25rem; }
.d-nav-group { display: flex; flex-direction: column; gap: .15rem; }
.d-nav-group__title {
  font-size: .72rem; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-muted, #889); padding: .4rem .7rem 0;
}
.d-nav-item {
  text-align: left; background: transparent; border: none; color: inherit; cursor: pointer;
  padding: .55rem .7rem; border-radius: 8px; font-size: .92rem; width: 100%;
}
.d-nav-item:hover { background: var(--color-hover, #f1f2f8); }
.d-nav-item--child { padding-left: 1.2rem; font-size: .88rem; opacity: .9; }
.d-nav-divider { border: none; border-top: 1px solid var(--color-border, #e5e7f0); margin: .35rem .5rem; }
.d-column {
  display: flex;
  flex-direction: column;
}
.d-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
.d-wrap {
  display: flex;
  flex-wrap: wrap;
}
.d-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
.d-scroll {
  overflow: auto;
  max-height: 100%;
}
.d-field {
  display: flex;
  flex-direction: column;
}
.d-checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.checkbox-label {
  cursor: pointer;
  user-select: none;
}
.field-group-label {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: var(--p-text-color);
}
.d-radio-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.d-radio-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.d-radio-item label {
  cursor: pointer;
}
.required-mark {
  color: var(--p-red-500);
}
.field-error {
  color: var(--p-red-500);
  font-size: 0.75rem;
  margin-top: 0.25rem;
}
.d-card {
  transition: all 0.2s;
  border-radius: 0.75rem;
  overflow: hidden;
}
.d-card--elevated :deep(.p-card) {
  box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
}
.d-card--filled :deep(.p-card) {
  box-shadow: none;
  background: var(--p-surface-100, #f5f5f5);
  border: none;
}
.d-card--outlined :deep(.p-card) {
  box-shadow: none;
  background: transparent;
  border: 1px solid var(--p-surface-200, #e5e5e5);
}
.d-card--selected {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
  background: var(--p-primary-50, rgba(103, 80, 164, 0.05));
}
.d-card--selected :deep(.p-card) {
  background: var(--p-primary-50, rgba(103, 80, 164, 0.05));
}
.cursor-pointer {
  cursor: pointer;
}
.cursor-pointer:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.d-text--displayLarge { font-size: 3.5rem; font-weight: 400; }
.d-text--displayMedium { font-size: 2.8rem; font-weight: 400; }
.d-text--displaySmall { font-size: 2.2rem; font-weight: 400; }
.d-text--headlineLarge { font-size: 2rem; font-weight: 400; }
.d-text--headlineMedium { font-size: 1.75rem; font-weight: 400; }
.d-text--headlineSmall { font-size: 1.5rem; font-weight: 400; }
.d-text--titleLarge { font-size: 1.375rem; font-weight: 500; }
.d-text--titleMedium { font-size: 1rem; font-weight: 500; letter-spacing: 0.15px; }
.d-text--titleSmall { font-size: 0.875rem; font-weight: 500; letter-spacing: 0.1px; }
.d-text--bodyLarge { font-size: 1rem; font-weight: 400; }
.d-text--bodyMedium { font-size: 0.875rem; font-weight: 400; }
.d-text--bodySmall { font-size: 0.75rem; font-weight: 400; }
.d-text--labelLarge { font-size: 0.875rem; font-weight: 500; }
.d-text--labelMedium { font-size: 0.75rem; font-weight: 500; }
.d-text--labelSmall { font-size: 0.6875rem; font-weight: 500; }
.d-text { color: var(--p-text-color); margin: 0; }

.material-icons {
  font-family: 'Material Icons', sans-serif;
  font-size: 24px;
  display: inline-block;
  vertical-align: middle;
}
.d-icon--sm { font-size: 18px; }
.d-icon--md { font-size: 24px; }
.d-icon--lg { font-size: 36px; }

.d-switch {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}
.switch-label {
  user-select: none;
}
.d-image {
  border-radius: 0.5rem;
}
.d-badge-value {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--p-red-500);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 4px;
}
.d-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--p-text-muted-color);
}
.d-nested {
  width: 100%;
}
.d-tab-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
}
.d-stack {
  position: relative;
}
.d-grid {
  display: grid;
}
.d-list-tile {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--p-surface-200);
}
.d-list-tile__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.d-list-tile__title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--p-text-color);
}
.d-list-tile__subtitle {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}
.d-avatar--sm { width: 32px; height: 32px; }
.d-avatar--lg :deep(.p-avatar) { width: 48px; height: 48px; font-size: 1.25rem; }
.d-avatar--xl :deep(.p-avatar) { width: 64px; height: 64px; font-size: 1.5rem; }
.d-richtext {
  margin: 0;
  line-height: 1.6;
}
.d-richtext-span { }
.font-bold { font-weight: 700; }
.font-italic { font-style: italic; }
.d-expansion-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.5rem;
}
.d-step-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 0;
}
.d-dialog-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.d-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.d-snackbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  min-height: 48px;
  gap: 1rem;
}
.d-snackbar--standard { background: var(--p-surface-700); color: #fff; }
.d-snackbar--success { background: var(--p-green-600, #16a34a); color: #fff; }
.d-snackbar--error { background: var(--p-red-600, #dc2626); color: #fff; }
.d-snackbar--warning { background: var(--p-yellow-600, #ca8a04); color: #fff; }
.d-snackbar--info { background: var(--p-blue-600, #2563eb); color: #fff; }
.d-snackbar__text { flex: 1; font-size: 0.875rem; }
.d-appbar {
  border-radius: 0 !important;
}
.d-appbar__leading {
  margin-right: 0.5rem;
}
.d-appbar__title {
  font-size: 1.375rem;
  font-weight: 500;
}
.d-appbar__actions {
  display: flex;
  gap: 0.25rem;
}
.d-nav-bar {
  display: flex;
  justify-content: space-around;
  background: var(--p-surface-0);
  border-top: 1px solid var(--p-surface-200);
  padding: 0.5rem 0;
}
.d-nav-bar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  padding: 0.25rem 1rem;
  border-radius: 1rem;
  transition: all 0.2s;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.d-nav-bar__item--active {
  color: var(--p-primary-color);
}
.d-nav-bar__item--active .material-icons {
  background: var(--p-primary-100, rgba(103,80,164,0.12));
  border-radius: 1rem;
  padding: 0.125rem 0.75rem;
}
.d-nav-drawer {
  display: flex;
  flex-direction: column;
}
.d-nav-drawer__header {
  padding: 1rem 1rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}
.d-nav-drawer__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
  border-radius: 2rem;
  margin: 0.125rem 0.5rem;
}
.d-nav-drawer__item:hover {
  background: var(--p-surface-100);
}
.d-nav-drawer__badge {
  margin-left: auto;
  background: var(--p-red-500);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 4px;
}
.d-toolbar__content {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.d-fab--small { width: 40px !important; height: 40px !important; }
.d-fab--large { width: 96px !important; height: 96px !important; font-size: 2rem !important; }
.d-array-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.d-array-field__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.d-array-field__empty {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  padding: 0.25rem 0;
}
.d-array-item {
  border: 1px solid var(--p-surface-200);
  border-radius: 0.5rem;
  padding: 0.75rem;
}
.d-array-item--object {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.d-array-item--primitive {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.d-array-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.d-array-item__index {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}
</style>
