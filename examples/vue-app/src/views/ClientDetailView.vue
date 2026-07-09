<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useWorkflow } from 'amorphie-workflow-manager-vue';
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import PseudoRenderer from '../components/PseudoRenderer.vue';
import { workflowManager, WORKFLOW_DOMAIN, WORKFLOW_NAME } from '../sdk/workflow';
import { fetchTransitionView } from '../sdk/clients';
import { getRouter } from '../sdk/router';
import { confirm } from '../composables/useConfirm';

// `instanceKey` is projected from the route input by page-router's Vue surface.
const props = defineProps<{ instanceKey: string }>();

const wf = useWorkflow({ manager: workflowManager, domain: WORKFLOW_DOMAIN, name: WORKFLOW_NAME });

const stateView = computed(() => (wf.view.value?.content ?? null) as ViewDefinition | null);
const instanceData = computed(() => (wf.data.value ?? {}) as Record<string, unknown>);

// Active transition form (a server-driven pseudo-ui view fetched via morph).
const formTransition = ref<string | null>(null);
const formView = ref<ViewDefinition | null>(null);
const formLoading = ref(false);

onMounted(() => void load());
onUnmounted(() => workflowManager.terminateWorkflow({ workflowName: WORKFLOW_NAME }));

async function load() {
  await wf.continueWith({ instanceId: props.instanceKey });
}

async function chooseTransition(key: string) {
  // Reset any open form, then try to load this transition's server-driven form.
  formTransition.value = key;
  formView.value = null;
  formLoading.value = true;
  try {
    formView.value = await fetchTransitionView(props.instanceKey, key);
    if (!formView.value) {
      // No form → confirm & fire directly (e.g. a pure status transition).
      await fireDirect(key);
      formTransition.value = null;
    }
  } finally {
    formLoading.value = false;
  }
}

async function fireDirect(key: string) {
  const ok = await confirm({
    title: `Run "${key}"?`,
    message: `Transition "${key}" will run on the real backend for ${props.instanceKey}.`,
    confirmLabel: 'Run',
    danger: key === 'passive',
  });
  if (!ok) return;
  await wf.transition({ transitionKey: key, body: {} });
}

async function submitForm(payload: { command?: string; data: Record<string, unknown> }) {
  const key = formTransition.value;
  if (!key) return;
  const ok = await confirm({
    title: `Submit "${key}"?`,
    message: `This will run the "${key}" transition on the real backend for ${props.instanceKey}.`,
    confirmLabel: 'Submit',
  });
  if (!ok) return;
  await wf.transition({ transitionKey: key, body: payload.data });
  formTransition.value = null;
  formView.value = null;
}

function cancelForm() {
  formTransition.value = null;
  formView.value = null;
}

function back() {
  void getRouter().navigate({ routeKey: 'clients' });
}
</script>

<template>
  <div class="view">
    <button class="btn ghost sm back" @click="back">‹ Clients</button>

    <h1>Client: <span class="mono">{{ instanceKey }}</span></h1>
    <div class="statusbar">
      <span>state: <strong>{{ wf.currentState.value ?? '—' }}</strong></span>
      <span>status: <strong>{{ wf.status.value ?? '—' }}</strong></span>
      <span v-if="wf.loading.value" class="loading">⏳</span>
    </div>

    <div v-if="wf.error.value" class="error">{{ String(wf.error.value) }}</div>

    <!-- Transition form (server-driven) -->
    <div v-if="formTransition && formView" class="panel form">
      <div class="form-head">
        <h3>Transition: {{ formTransition }}</h3>
        <button class="btn ghost sm" @click="cancelForm">✕ Cancel</button>
      </div>
      <PseudoRenderer :view="formView" :instance-data="instanceData" @submit="submitForm" />
    </div>

    <template v-else>
      <!-- Available transitions -->
      <div v-if="wf.transitions.value.length" class="transitions">
        <button
          v-for="t in wf.transitions.value"
          :key="t.key"
          class="btn"
          :class="{ danger: t.key === 'passive' }"
          :disabled="formLoading"
          @click="chooseTransition(t.key)"
        >
          {{ t.key }}
        </button>
      </div>

      <!-- Current server-driven state view -->
      <div class="panel">
        <PseudoRenderer v-if="stateView" :view="stateView" :instance-data="instanceData" />
        <p v-else class="muted">Loading client view…</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.view { max-width: 820px; }
.back { margin-bottom: 1rem; }
.mono { font-family: ui-monospace, monospace; font-size: .95rem; }
.statusbar { display: flex; gap: 1.25rem; margin: .5rem 0 1rem; font-size: .9rem; }
.transitions { display: flex; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.panel { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; background: var(--panel); }
.panel.form { margin-bottom: 1rem; border-color: var(--accent); }
.form-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
.form-head h3 { margin: 0; }
.btn { background: var(--accent); color: #fff; border: none; padding: .5rem 1rem; border-radius: 8px; cursor: pointer; }
.btn.sm { padding: .3rem .7rem; font-size: .8rem; }
.btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.btn.danger { background: #d33; }
.btn:disabled { opacity: .5; cursor: default; }
.error { background: #fdecea; color: #b3261e; padding: .6rem .9rem; border-radius: 6px; margin-bottom: 1rem; }
.muted { color: var(--muted); }
.loading { color: var(--accent); }
</style>
