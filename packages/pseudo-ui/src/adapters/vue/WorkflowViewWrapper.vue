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
  ViewDefinition,
  WorkflowSession,
  WorkflowStartField,
  WorkflowViewConfig,
  WorkflowViewNode,
} from '../../engine/types'
import { resolveExpression, localizeLabel } from '../../engine/expressionResolver'
import { useFormContext } from './useFormContext'
import { useDelegate, provideDelegate } from './injection'
import { useHistory } from './useHistory'
import { highlightJson } from './jsonHighlight'
import HistoryModal from './HistoryModal.vue'
import TransitionForm from './TransitionForm.vue'
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
  ...(props.node.instanceId ? { instanceId: String(val(props.node.instanceId) ?? '') } : {}),
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
// The host resolves each view's transition schema (from its dataSchema) so the
// renderer gets x-labels + validation; fall back to an empty schema until then.
const schema = computed<DataSchema>(() => session?.schema?.value ?? EMPTY_SCHEMA)

// Detail mode (opening an existing instance): when the current state defines no
// UI view, fall back to a read-only dump of the instance data so the detail is
// still useful. (A state that DOES define a view renders it as usual.)
const detailMode = computed(() => !!config.value.instanceId)
// The instance attributes, fed to the state view so its `$instance.*` binds
// resolve (read/detail views display these; without it the view renders blank).
const instanceValues = computed<Record<string, unknown>>(
  () => (session?.data.value ?? {}) as Record<string, unknown>,
)
// Raw instance-data viewer (detail pages): a `{ }` button opens a modal with the
// full instance data as pretty, syntax-highlighted JSON (scrollable).
const showRaw = ref(false)
// Raw viewer shows the FULL instance (metadata + attributes) when the host
// provides it; falls back to just the attributes otherwise.
const rawData = computed<Record<string, unknown>>(
  () => (session?.snapshot?.value ?? instanceValues.value) as Record<string, unknown>,
)
const rawJson = computed(() => highlightJson(rawData.value))

// Detail toolbar: current state, available transitions (dropdown → drive it),
// and transition history (button → modal). All optional on the session.
const stateLabel = computed(() => session?.state?.value ?? '')
const transitionOptions = computed(() => session?.transitions?.value ?? [])
const history = useHistory()
// A picked transition with a FORM (view+schema) opens it (prefilled for edit);
// Save fires it via the session. A no-form transition fires ad-hoc (empty body).
type TxForm = { view: ViewDefinition; schema: DataSchema | null; validationSchema: DataSchema | null; data: Record<string, unknown>; txKey: string }
const txForm = ref<TxForm | null>(null)
async function onPickTransition(e: Event): Promise<void> {
  const el = e.target as HTMLSelectElement
  const key = el.value
  el.value = ''
  if (!key || !session) return
  if (parent.getTransitionForm) {
    const form = await parent.getTransitionForm({
      domain: config.value.domain,
      workflow: config.value.name,
      instanceId: config.value.instanceId ?? '',
      transitionKey: key,
    })
    if (form?.view) {
      txForm.value = { view: form.view, schema: form.schema ?? null, validationSchema: form.validationSchema ?? null, data: form.data ?? {}, txKey: key }
      return
    }
  }
  await session.submit(key, {})
}
async function onTxApply(body: Record<string, unknown>): Promise<void> {
  const f = txForm.value
  if (!f || !session) return
  txForm.value = null
  await session.submit(f.txKey, body)
}
async function openHistory(): Promise<void> {
  if (!session?.history) return
  await history.show(
    { domain: config.value.domain, workflow: config.value.name, instanceId: config.value.instanceId ?? '' },
    () => session!.history!(),
  )
}

const detailRows = computed<Array<{ key: string; value: string }>>(() => {
  const d = instanceValues.value
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([key, v]) => ({ key, value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v) }))
})

// Remount the nested view per workflow state so each state gets a fresh form
// context (advancing state = new view, cleared inputs).
const stateKey = ref(0)
// Remount only on VIEW change (new state = fresh form). The async-resolved schema
// must NOT remount — that would tear down the live form (and its submit bridge)
// mid-interaction; NestedComponentWrapper adopts a late schema in place instead.
watch(view, () => { stateKey.value += 1 })

async function begin(): Promise<void> {
  started.value = true
  // Detail mode: open an existing instance (current-state view) instead of starting.
  const iid = config.value.instanceId
  if (iid && session?.open) {
    await session.open(iid)
    return
  }
  await session?.start(needsForm.value ? { ...formModel.value } : undefined)
}

onMounted(() => {
  if (!needsForm.value) void begin()
})
onUnmounted(() => session?.dispose?.())
</script>

<template>
  <div class="d-workflow" :class="{ 'd-workflow--detail': detailMode }">
    <!-- Detail pages: state + available transitions + history + raw JSON. -->
    <div v-if="detailMode && ready" class="d-detail-toolbar">
      <span v-if="stateLabel" class="d-detail-state">
        <span class="d-detail-state__label">{{ ctx.lang.startsWith('tr') ? 'Durum' : 'State' }}</span>
        <span class="d-instancelist-chip d-instancelist-chip--success">{{ stateLabel }}</span>
      </span>
      <span class="d-detail-toolbar__spacer"></span>
      <select
        v-if="transitionOptions.length"
        class="d-detail-transition"
        :aria-label="ctx.lang.startsWith('tr') ? 'Geçişler' : 'Transitions'"
        @change="onPickTransition"
      >
        <option value="">
          {{ ctx.lang.startsWith('tr') ? 'Geçiş…' : 'Transition…' }}
        </option>
        <option v-for="t in transitionOptions" :key="t.key" :value="t.key">{{ t.key }}</option>
      </select>
      <button
        v-if="session && session.history"
        type="button"
        class="d-detail-histbtn"
        @click="openHistory"
      >
        {{ ctx.lang.startsWith('tr') ? 'Geçmiş' : 'History' }}
      </button>
      <button
        type="button"
        class="d-raw-btn"
        :title="ctx.lang.startsWith('tr') ? 'Ham veri (JSON)' : 'Raw data (JSON)'"
        aria-label="Raw data"
        @click="showRaw = true"
      >
        {&nbsp;}
      </button>
    </div>

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
        :schema="schema"
        :view="view"
        :lang="ctx.lang"
        :bound-instance-values="instanceValues"
      />
      <!-- No state view (e.g. a terminal state): show the instance data read-only. -->
      <dl v-else-if="ready && detailMode" class="d-detail">
        <template v-for="row in detailRows" :key="row.key">
          <dt class="d-detail__key">{{ row.key }}</dt>
          <dd class="d-detail__val">{{ row.value }}</dd>
        </template>
        <p v-if="!detailRows.length" class="d-detail__empty">
          {{ ctx.lang.startsWith('tr') ? 'Veri yok' : 'No data' }}
        </p>
      </dl>
      <div v-else-if="!errorText" class="d-workflow-loading">
        <i class="pi pi-spinner pi-spin"></i>
      </div>
    </template>

    <!-- Transition history: shared modal shell (config view / fallback + a
         `{ }` raw-JSON toggle). A page-display history view opens as a tab
         instead (handled in useHistory). -->
    <HistoryModal
      :history="history"
      :title="ctx.lang.startsWith('tr') ? 'Geçiş Geçmişi' : 'Transition History'"
      :lang="ctx.lang"
    />

    <!-- Transition form (toolbar dropdown → a transition that needs input).
         Self-presenting view (its own Dialog + buttons); we just bridge. -->
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

    <!-- Raw instance-data modal (scrollable, JSON syntax-highlighted). -->
    <div v-if="showRaw" class="d-raw-modal" @click.self="showRaw = false">
      <div class="d-raw-dialog" role="dialog" aria-modal="true">
        <header class="d-raw-head">
          <span>{ } {{ ctx.lang.startsWith('tr') ? 'Ham Veri' : 'Raw Data' }}</span>
          <button type="button" class="d-raw-close" aria-label="Close" @click="showRaw = false">×</button>
        </header>
        <pre class="d-raw-json"><code v-html="rawJson"></code></pre>
      </div>
    </div>
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
