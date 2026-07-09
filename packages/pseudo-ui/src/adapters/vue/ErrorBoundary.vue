<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

defineProps<{ label?: string }>()

const error = ref<string | null>(null)

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err.message : String(err)
  return false
})
</script>

<template>
  <div v-if="error" class="d-error-boundary" role="alert">
    <i class="pi pi-exclamation-triangle" style="margin-right: 0.5rem; color: var(--p-red-500)"></i>
    <span><strong>{{ label || 'Component' }} render error:</strong> {{ error }}</span>
  </div>
  <slot v-else />
</template>
