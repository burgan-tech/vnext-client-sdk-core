<!--
  HistoryModal — the modal shell for transition history, used by both the list
  row menu and the detail toolbar (fed a useHistory() controller). A thin shell:
  title + close. The BODY is always the config-referenced history view (fed the
  rows as $instance.transitions) — history is config-owned, there is no SDK
  fallback layout, and the per-row `{ }` raw lives in the view (a `Json` node).
  When the configured view's display is a page, useHistory navigates instead and
  this modal never opens.
-->
<script setup lang="ts">
import type { useHistory } from './useHistory'
import NestedComponentWrapper from './NestedComponentWrapper.vue'

const props = defineProps<{
  history: ReturnType<typeof useHistory>
  title: string
  lang: string
}>()

function close(): void {
  props.history.open.value = false
}
</script>

<template>
  <div v-if="history.open.value" class="d-raw-modal" @click.self="close">
    <div class="d-raw-dialog" role="dialog" aria-modal="true">
      <header class="d-raw-head">
        <span>{{ title }}</span>
        <span class="d-detail-toolbar__spacer"></span>
        <button type="button" class="d-raw-close" aria-label="Close" @click="close">×</button>
      </header>
      <NestedComponentWrapper
        v-if="history.viewDef.value"
        :schema="history.schemaDef.value ?? { type: 'object', properties: {} }"
        :view="history.viewDef.value"
        :lang="lang"
        :bound-instance-values="{ transitions: history.items.value }"
      />
      <div v-else class="d-hist__empty"><i class="pi pi-spinner pi-spin"></i></div>
    </div>
  </div>
</template>
