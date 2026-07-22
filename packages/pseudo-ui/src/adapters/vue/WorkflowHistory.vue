<!--
  WorkflowHistory — reusable transition-history list. Fed a resolved list of
  history entries (from delegate.getTransitionHistory or session.history); shown
  in a modal both on the detail page and from a list's row menu. Future history
  UX (grouping, diffs, filtering) evolves here, in one place.
-->
<script setup lang="ts">
import type { TransitionHistoryItem } from '../../engine/types'

const props = defineProps<{
  items: TransitionHistoryItem[]
  loading?: boolean
  lang: string
}>()

function fmtAt(at?: string): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(props.lang)
}
</script>

<template>
  <div class="d-hist">
    <div v-if="loading" class="d-hist__empty"><i class="pi pi-spinner pi-spin"></i></div>
    <p v-else-if="!items.length" class="d-hist__empty">
      {{ lang.startsWith('tr') ? 'Kayıt yok' : 'No history' }}
    </p>
    <ol v-else class="d-hist__list">
      <li v-for="(h, i) in items" :key="i" class="d-hist__item">
        <span class="d-hist__states">{{ h.fromState }} → {{ h.toState }}</span>
        <span class="d-hist__key">{{ h.transitionKey }}</span>
        <span class="d-hist__meta">{{ fmtAt(h.at) }}{{ h.triggerType ? ' · ' + h.triggerType : '' }}</span>
      </li>
    </ol>
  </div>
</template>
