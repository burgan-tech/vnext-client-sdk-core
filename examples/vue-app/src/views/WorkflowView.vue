<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useWorkflow } from 'amorphie-workflow-manager-vue';
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import PseudoRenderer from '../components/PseudoRenderer.vue';
import {
  workflowManager,
  WORKFLOW_DOMAIN,
  WORKFLOW_NAME,
  CLIENT_INSTANCE_KEY,
} from '../sdk/workflow';
import { setContextValue } from '../sdk/context';

// The flagship integration: workflow-manager (real test-vnext-morph-idm backend)
// drives the state machine; the current state's view is a pseudo-ui
// ViewDefinition rendered by <PseudoRenderer>, and a pseudo-ui `submit`
// (command = transition key) fires the next transition.
const wf = useWorkflow({
  manager: workflowManager,
  domain: WORKFLOW_DOMAIN,
  name: WORKFLOW_NAME,
});

// wf.view.value?.content is the pseudo-ui ViewDefinition served by the backend.
const currentView = computed(() => (wf.view.value?.content ?? null) as ViewDefinition | null);
// Instance attributes feed `$instance.*` bindings inside the view.
const instanceData = computed(() => (wf.data.value ?? {}) as Record<string, unknown>);

// Attach to the fixed client instance (business key) and start polling its state.
onMounted(() => void loadInstance());

async function loadInstance() {
  const res = await wf.continueWith({ instanceId: CLIENT_INSTANCE_KEY });
  if (res.ok) setContextValue('workflow/lastInstanceId', res.instanceId);
}

async function onSubmit(payload: { command?: string; data: Record<string, unknown> }) {
  if (!payload.command) return;
  // `body` is the raw attributes object — the SDK wraps it as { attributes: body }.
  await wf.transition({ transitionKey: payload.command, body: payload.data });
}

async function fireTransition(key: string) {
  await wf.transition({ transitionKey: key, body: {} });
}
</script>

<template>
  <div class="view">
    <h1>Workflow — morph-idm / client</h1>
    <p class="lead">
      <code>workflow-manager</code> (real <code>test-vnext-morph-idm</code> backend)
      → <code>pseudo-ui</code>: the live instance's view is server-driven and
      rendered here. Instance key: <code>{{ CLIENT_INSTANCE_KEY }}</code>.
    </p>

    <div class="statusbar">
      <span>state: <strong>{{ wf.currentState.value ?? '—' }}</strong></span>
      <span>status: <strong>{{ wf.status.value ?? '—' }}</strong></span>
      <span v-if="wf.loading.value" class="loading">⏳ loading…</span>
      <span v-if="wf.isTerminal.value" class="terminal">● terminal</span>
    </div>

    <div v-if="wf.error.value" class="error">{{ String(wf.error.value) }}</div>

    <div v-if="!wf.ready.value" class="panel start">
      <p>Loading instance <code>{{ CLIENT_INSTANCE_KEY }}</code>…</p>
      <button class="btn ghost" @click="loadInstance">↻ Reload</button>
    </div>

    <div v-else class="panel">
      <PseudoRenderer
        v-if="currentView"
        :view="currentView"
        :instance-data="instanceData"
        @submit="onSubmit"
      />
      <p v-else class="muted">This state has no view.</p>

      <div v-if="wf.transitions.value.length" class="transitions">
        <span class="tlabel">transitions:</span>
        <button
          v-for="t in wf.transitions.value"
          :key="t.key"
          class="btn ghost"
          @click="fireTransition(t.key)"
        >
          {{ t.key }}
        </button>
      </div>
    </div>

    <details class="debug">
      <summary>workflow data</summary>
      <pre>{{ JSON.stringify(wf.data.value ?? {}, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped>
.view { max-width: 720px; }
.statusbar { display: flex; gap: 1.25rem; align-items: center; margin: .5rem 0 1rem; font-size: .9rem; }
.statusbar .loading { color: var(--accent); }
.statusbar .terminal { color: #2a9d3f; }
.panel { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; background: var(--panel); }
.panel.start { text-align: center; }
.transitions { display: flex; align-items: center; gap: .5rem; margin-top: 1rem; flex-wrap: wrap; }
.tlabel { font-size: .8rem; color: var(--muted); }
.btn { background: var(--accent); color: #fff; border: none; padding: .55rem 1.1rem; border-radius: 8px; cursor: pointer; font-size: .95rem; }
.btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); padding: .35rem .8rem; }
.error { background: #fdecea; color: #b3261e; padding: .6rem .9rem; border-radius: 6px; margin-bottom: 1rem; }
.muted { color: var(--muted); }
.debug { margin-top: 1.25rem; }
.debug pre { background: #0b1020; color: #cfe3ff; padding: 1rem; border-radius: 8px; overflow: auto; }
</style>
