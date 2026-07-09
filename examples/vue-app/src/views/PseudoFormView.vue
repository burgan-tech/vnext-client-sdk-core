<script setup lang="ts">
import { ref } from 'vue';
import type { DataSchema, ViewDefinition } from '@burgan-tech/pseudo-ui';
import PseudoRenderer from '../components/PseudoRenderer.vue';
import { setContextValue } from '../sdk/context';

// A standalone pseudo-ui view (not backed by a workflow). Demonstrates the
// server-driven UI renderer on its own, and writes the submitted payload into
// the shared context-store.
const schema: DataSchema = {
  type: 'object',
  required: ['firstName'],
  properties: {
    firstName: { type: 'string', title: 'First name' },
    lastName: { type: 'string', title: 'Last name' },
    email: { type: 'string', title: 'Email' },
  } as DataSchema['properties'],
};

const view: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'inline',
  view: {
    type: 'Column',
    gap: 'md',
    children: [
      { type: 'Text', content: '📝 Customer form', variant: 'headlineMedium' },
      { type: 'Text', content: 'Rendered entirely from JSON by pseudo-ui.', variant: 'bodyMedium' },
      { type: 'TextField', bind: 'firstName', label: 'First name' },
      { type: 'TextField', bind: 'lastName', label: 'Last name' },
      { type: 'TextField', bind: 'email', label: 'Email' },
      { type: 'Button', label: 'Save', action: { action: 'submit', command: 'save-customer' } },
    ],
  },
};

const lastSubmit = ref<Record<string, unknown> | null>(null);

function onSubmit(payload: { command?: string; data: Record<string, unknown> }) {
  lastSubmit.value = payload.data;
  setContextValue('demo/lastCustomer', payload.data);
}
</script>

<template>
  <div class="view">
    <h1>Pseudo-UI Form</h1>
    <p class="lead">A JSON view definition rendered by <code>@burgan-tech/pseudo-ui/vue</code>.</p>

    <div class="panel">
      <PseudoRenderer :view="view" :schema="schema" @submit="onSubmit" />
    </div>

    <div v-if="lastSubmit" class="result">
      <h3>Submitted (also written to context-store as <code>demo/lastCustomer</code>)</h3>
      <pre>{{ JSON.stringify(lastSubmit, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 720px; }
.panel { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; background: var(--panel); }
.result { margin-top: 1.25rem; }
.result pre { background: #0b1020; color: #cfe3ff; padding: 1rem; border-radius: 8px; overflow: auto; }
</style>
