<script setup lang="ts">
import { watch, onMounted, nextTick, reactive, watchEffect, computed } from 'vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../engine/types'
import { createFormContext, provideFormContext } from './useFormContext'
import { provideDelegate, provideRenderRoot, provideDesigner, provideUiStrings, provideDataDomain, provideConfigViews } from './injection'
import type { UiStrings, ConfigViews } from './injection'
import type { DesignerMode, DesignerClassNames, DesignerState } from './injection'
import { useLookups } from './useLookups'
import { adoptStylesIntoRoot } from './styleInjection'
import vueStyleCss from './style'
import DynamicRenderer from './DynamicRenderer.vue'

const props = withDefaults(defineProps<{
  schema: DataSchema
  view: ViewDefinition
  formData?: Record<string, unknown>
  instanceData?: Record<string, unknown>
  lang?: string
  delegate: PseudoViewDelegate
  /**
   * Designer/preview mode.
   * - `false` / `'off'` (default): normal render.
   * - `'preview'`: rendering bypasses `x-conditional` visibility rules and
   *   the empty-ForEach placeholder so the host can show the full
   *   structure, **but no canvas chrome is rendered** (no node outlines,
   *   path attributes or drag-drop / delete handlers). Use this for a
   *   side-by-side WYSIWYG preview pane.
   * - `true` / `'edit'`: full canvas — every node is wrapped with a handle
   *   that exposes `data-pseudo-path`, fires `delegate.onNodeSelect`,
   *   accepts drag-drop, and shows the delete button on selection.
   */
  designer?: boolean | DesignerMode
  /**
   * Host-provided class names that replace the SDK's default designer
   * chrome classes. Combine with the `--pseudo-designer-*` CSS custom
   * properties for simple token tweaks without overriding full class names.
   */
  designerClassNames?: DesignerClassNames
  /**
   * Designer mode only. JSON Pointer of the currently selected node
   * (controlled by the host). The SDK adds the selected styling and shows
   * the delete button on this node. Combine with `delegate.onNodeSelect`
   * to update it from clicks.
   */
  selectedNodePath?: string
  /**
   * When the view is mounted inside a Shadow DOM, pass the `ShadowRoot`
   * here so the SDK can: (1) adopt its component CSS into the root via
   * `adoptedStyleSheets`, and (2) route PrimeVue overlays (Dialog,
   * Dropdown, DatePicker, Drawer) to the shadow host via the `appendTo`
   * prop so they render in the same style scope as their triggers.
   * PrimeVue theme CSS remains the consumer's responsibility — adopt it
   * with the exported `adoptStylesIntoRoot` helper.
   */
  renderRoot?: ShadowRoot
  /**
   * Generic UI-chrome strings (section headings, empty-state text, tooltips) the
   * SDK renders itself, keyed by a stable id with localizable values. Host-fed
   * from backend config so the SDK carries no translated literals. See
   * {@link UiStrings}.
   */
  uiStrings?: UiStrings
  /**
   * Default data domain for instance-querying nodes (e.g. InstanceList) whose
   * config omits `domain`. Host-fed from config so a solution-specific domain
   * isn't repeated per view.
   */
  dataDomain?: string
  /**
   * Config-referenced surface views (e.g. `{ transitionHistory: {key,domain,flow} }`).
   * Host-fed from config; the SDK opens these as a modal or page per the referenced
   * VIEW's own `display`. See {@link ConfigViews}.
   */
  configViews?: ConfigViews
}>(), { designer: false })

const emit = defineEmits<{
  (e: 'formChange', data: Record<string, unknown>): void
  (e: 'validationChange', errors: Record<string, string>): void
}>()

const log = props.delegate.onLog ?? (() => {})

// Use a Proxy so all delegate reads always forward to the *current* prop value.
// This ensures that when the host switches from a normal delegate to a designer
// delegate after the view has already mounted, callbacks like onNodeSelect /
// onNodeDelete / onNodeDropFromPalette are picked up immediately.
const liveDelegate = new Proxy({} as PseudoViewDelegate, {
  get(_target, key) {
    return (props.delegate as unknown as Record<string | symbol, unknown>)[key as string]
  },
})
provideDelegate(liveDelegate)
provideRenderRoot(props.renderRoot)
// Generic UI-chrome strings (host-fed from config). Loaded at boot before any
// view renders, so a plain snapshot is enough — no reactivity needed.
provideUiStrings(props.uiStrings ?? {})
provideDataDomain(props.dataDomain ?? '')
provideConfigViews(props.configViews ?? {})

if (props.renderRoot) {
  adoptStylesIntoRoot(props.renderRoot, [vueStyleCss])
}

log('info', 'PseudoView initializing', undefined, { schema: props.schema.$id, lang: props.lang })

// Normalise `designer` (boolean | mode) to a DesignerMode and an active flag.
// `true` → 'edit', `false` → 'off'. Both 'preview' and 'edit' activate the
// renderer's visibility-bypass behaviour (designerMode on the form context).
const designerMode = computed<DesignerMode>(() =>
  props.designer === true ? 'edit'
  : props.designer === false || props.designer === undefined || props.designer === 'off' ? 'off'
  : props.designer
)
const designerActive = computed(() => designerMode.value !== 'off')

const ctx = createFormContext(props.schema, props.lang ?? 'tr', { designerMode: designerActive.value })
provideFormContext(ctx)

// Provide reactive designer state so DesignerNode reads mode/selection/classes.
const designerState = reactive<DesignerState>({
  mode: designerMode.value,
  selectedNodePath: props.selectedNodePath,
  classNames: props.designerClassNames,
})
watchEffect(() => {
  designerState.mode = designerMode.value
  designerState.selectedNodePath = props.selectedNodePath
  designerState.classNames = props.designerClassNames
  ctx.designerMode = designerActive.value
})
provideDesigner(designerState)

if (props.view.uiState) {
  Object.assign(ctx.uiState, props.view.uiState)
  log('info', 'UI state initialized from view definition', undefined, { keys: Object.keys(props.view.uiState) })
}

if (props.formData) {
  Object.assign(ctx.formData, props.formData)
  log('info', 'Initial form data applied', undefined, { keys: Object.keys(props.formData) })
}

if (props.instanceData) {
  Object.assign(ctx.instanceData, props.instanceData)
  log('info', 'Instance data applied', undefined, { keys: Object.keys(props.instanceData) })
  diagnoseData('instanceData', props.instanceData)
}

function diagnoseData(source: string, data: Record<string, unknown>) {
  if (!props.schema.properties) return
  const schemaFields = Object.keys(props.schema.properties)
  const dataFields = Object.keys(data)

  const missingFromData = schemaFields.filter(f => !dataFields.includes(f))
  const extraInData = dataFields.filter(f => !schemaFields.includes(f))

  if (missingFromData.length > 0) {
    log('info', `${source}: ${missingFromData.length} schema field(s) not present in data`, undefined, {
      source: 'Diagnostics',
      missing: missingFromData,
    })
  }

  if (extraInData.length > 0) {
    log('info', `${source}: ${extraInData.length} field(s) in data not defined in schema`, undefined, {
      source: 'Diagnostics',
      extra: extraInData,
    })
  }
}

watch(() => props.lang, (newLang) => {
  if (newLang) {
    ctx.lang = newLang
    log('info', `Language changed to "${newLang}"`)
  }
})

watch(() => props.schema, (newSchema) => {
  ctx.schema = newSchema
  log('info', 'Schema updated', undefined, { schema: newSchema.$id })
})

watch(() => props.formData, (newData) => {
  if (newData) {
    Object.assign(ctx.formData, newData)
    log('info', 'Form data updated', undefined, { keys: Object.keys(newData) })
  }
}, { deep: true })

watch(() => props.instanceData, (newData) => {
  for (const key of Object.keys(ctx.instanceData)) {
    delete ctx.instanceData[key]
  }
  if (newData) {
    Object.assign(ctx.instanceData, newData)
    diagnoseData('instanceData', newData)
  }
  log('info', 'Instance data updated', undefined, { keys: newData ? Object.keys(newData) : [] })
}, { deep: true })

watch(() => ctx.formData, (data) => {
  emit('formChange', { ...data })
}, { deep: true })

watch(() => ctx.errors, (errors) => {
  emit('validationChange', { ...errors })
}, { deep: true })

onMounted(() => {
  log('info', 'PseudoView mounted')
  nextTick(() => {
    if (props.view.lookups?.length) {
      log('debug', `Initializing ${props.view.lookups.length} lookup(s)`, undefined, { lookups: props.view.lookups })
      useLookups(props.view.lookups, ctx, props.delegate.requestData, log)
    }
  })
})
</script>

<template>
  <DynamicRenderer :node="view.view" />
</template>
