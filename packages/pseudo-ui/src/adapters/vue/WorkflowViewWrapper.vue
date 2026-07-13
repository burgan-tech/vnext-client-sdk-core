<!--
  Renders a WorkflowView node: the HOST drives the workflow (via
  delegate.driveWorkflow → WorkflowSession) and pseudo-ui renders each state's
  server-defined view inline, bridging its `submit` actions back into the
  session as transitions. A start form (from node.startFields) collects a start
  payload before the instance is created; flows without start fields start on
  mount. No workflow/UI chrome lives in the host app — this is generic.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  DataSchema,
  PseudoViewDelegate,
  WorkflowSession,
  WorkflowStartField,
  WorkflowViewConfig,
  WorkflowViewNode,
} from '../../engine/types'
import { resolveExpression, localizeLabel } from '../../engine/expressionResolver'
import { useFormContext } from './useFormContext'
import { useDelegate, provideDelegate } from './injection'
import NestedComponentWrapper from './NestedComponentWrapper.vue'

const props = defineProps<{
  node: WorkflowViewNode
  item?: Record<string, unknown>
}>()

const ctx = useFormContext()
const parent = useDelegate()
const log = parent.onLog ?? (() => {})

const EMPTY_SCHEMA: DataSchema = { type: 'object', properties: {} }

// A config field may be a literal ("morph-idm") or an expression ("$instance.x").
function val(v: unknown): unknown {
  return typeof v === 'string' && v.startsWith('$') ? resolveExpression(v, ctx, props.item) : v
}

const config = computed<WorkflowViewConfig>(() => ({
  domain: String(val(props.node.domain) ?? ''),
  name: String(val(props.node.name) ?? ''),
  ...(props.node.version ? { version: String(val(props.node.version)) } : {}),
  ...(props.node.keyFrom ? { keyFrom: String(val(props.node.keyFrom)) } : {}),
  ...(props.node.start ? { start: props.node.start } : {}),
  ...(props.node.startFields ? { startFields: props.node.startFields } : {}),
}))

const startFields = computed<WorkflowStartField[]>(() => props.node.startFields ?? [])
const needsForm = computed(() => startFields.value.length > 0)
const started = ref(false)
const formModel = ref<Record<string, string>>({})

const flabel = (f: WorkflowStartField) => localizeLabel(f.label, ctx.lang) || f.name

// The host owns the workflow lifecycle; we only render + submit into it.
let session: WorkflowSession | null = null
if (parent.driveWorkflow) {
  session = parent.driveWorkflow(config.value)
} else {
  log('error', 'WorkflowView needs delegate.driveWorkflow, but none was provided', undefined, {
    source: 'WorkflowView',
    workflow: `${config.value.domain}/${config.value.name}`,
  })
}

// Bridge the nested view's `submit` actions into workflow transitions; every
// other action bubbles to the host. Nested renderers inherit this via inject.
const bridged: PseudoViewDelegate = {
  ...parent,
  async onAction(action, data, command, context) {
    if (action === 'submit' && session) {
      await session.submit(command ?? '', data)
      return
    }
    await parent.onAction(action, data, command, context)
  },
}
provideDelegate(bridged)

const view = computed(() => session?.view.value ?? null)
const ready = computed(() => session?.ready.value ?? false)
const errorText = computed(() => session?.error.value ?? '')

// Remount the nested view per workflow state so each state gets a fresh form
// context (advancing state = new view, cleared inputs).
const stateKey = ref(0)
watch(view, () => { stateKey.value += 1 })

async function begin(): Promise<void> {
  started.value = true
  await session?.start(needsForm.value ? { ...formModel.value } : undefined)
}

onMounted(() => {
  if (!needsForm.value) void begin()
})
onUnmounted(() => session?.dispose?.())
</script>

<template>
  <div class="d-workflow">
    <!-- Start form: collect the start payload before creating the instance. -->
    <form v-if="needsForm && !started" class="d-workflow-startform" @submit.prevent="begin">
      <label v-for="f in startFields" :key="f.name" class="d-workflow-field">
        <span>{{ flabel(f) }}</span>
        <input v-model="formModel[f.name]" :type="f.type ?? 'text'" required autocomplete="off" />
      </label>
      <button type="submit" class="d-workflow-start">{{ ctx.lang.startsWith('tr') ? 'Başlat' : 'Start' }}</button>
    </form>

    <template v-else>
      <div v-if="errorText" class="d-workflow-error">{{ errorText }}</div>
      <NestedComponentWrapper
        v-if="ready && view"
        :key="stateKey"
        :schema="EMPTY_SCHEMA"
        :view="view"
        :lang="ctx.lang"
      />
      <div v-else-if="!errorText" class="d-workflow-loading">
        <i class="pi pi-spinner pi-spin"></i>
      </div>
    </template>
  </div>
</template>

<style scoped>
.d-workflow-startform { display: flex; flex-direction: column; gap: 0.9rem; max-width: 360px; }
.d-workflow-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: var(--color-muted, #667); }
.d-workflow-field input {
  padding: 0.55rem 0.7rem; border: 1px solid var(--color-border, #e3e6ef); border-radius: 8px;
  font-size: 0.95rem; background: var(--color-surface, #fff); color: var(--color-on-surface, #1f2430);
}
.d-workflow-start {
  align-self: flex-start; padding: 0.55rem 1.2rem; border: none; border-radius: 8px; cursor: pointer;
  background: var(--color-primary, #4f46e5); color: #fff; font-size: 0.9rem; font-weight: 600;
}
.d-workflow-error { background: #fdecea; color: #b3261e; padding: 0.6rem 0.9rem; border-radius: 6px; margin-bottom: 1rem; }
.d-workflow-loading { display: flex; justify-content: center; padding: 2rem 0; color: var(--color-primary, #4f46e5); }
</style>
