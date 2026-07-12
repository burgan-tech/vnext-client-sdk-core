<!--
  Reusable wrapper around pseudo-ui's <PseudoView>. Builds a PseudoViewDelegate
  and re-emits `submit` actions so a host (e.g. WorkflowView) can bridge them to
  a workflow transition. Used both for a standalone form and for workflow steps.
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '@burgan-tech/pseudo-ui';
import { PseudoView } from '@burgan-tech/pseudo-ui/vue';

const props = defineProps<{
  view: ViewDefinition;
  schema?: DataSchema;
  initialData?: Record<string, unknown>;
  // Read-only instance attributes resolved by `$instance.*` bindings in the view.
  instanceData?: Record<string, unknown>;
  // Active locale (TR/EN) for LocalizedString rendering. Default 'en'.
  lang?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', payload: { command?: string; data: Record<string, unknown> }): void;
  (e: 'change', data: Record<string, unknown>): void;
}>();

const formData = reactive<Record<string, unknown>>({ ...(props.initialData ?? {}) });

// Reset form data when the view changes (e.g. workflow advances to a new step).
watch(
  () => props.view,
  () => {
    for (const k of Object.keys(formData)) delete formData[k];
    Object.assign(formData, props.initialData ?? {});
  },
);

const delegate: PseudoViewDelegate = {
  requestData: async (ref) => {
    throw new Error(`[PseudoRenderer] no data source configured for "${ref}"`);
  },
  loadComponent: async (ref) => {
    throw new Error(`[PseudoRenderer] no nested component loader for "${ref}"`);
  },
  async onAction(action, data, command) {
    if (action === 'submit') {
      emit('submit', { command, data: data as Record<string, unknown> });
    }
  },
  onLog: (level, message) => {
    // eslint-disable-next-line no-console
    console.debug(`%c[pseudo-ui] ${level}: ${message}`, 'color:#06c');
  },
};

function onFormChange(data: Record<string, unknown>) {
  emit('change', data);
}
</script>

<template>
  <PseudoView
    :schema="schema ?? { type: 'object', properties: {} }"
    :view="view"
    :form-data="formData"
    :instance-data="instanceData"
    :lang="lang ?? 'en'"
    :delegate="delegate"
    @form-change="onFormChange"
  />
</template>
