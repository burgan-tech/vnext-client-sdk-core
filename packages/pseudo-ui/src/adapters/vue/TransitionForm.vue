<!--
  TransitionForm — renders a transition's own view (prefilled for edit) so the
  user can supply input before the transition fires. The view is SELF-PRESENTING
  (its root is typically a Dialog with its own Cancel/Submit buttons), so this is
  NOT a modal shell — it just mounts the view and BRIDGES the view's own buttons:
  the `submit` action emits `apply(body)` (the caller fires the transition), and
  `cancel` emits `close`. No extra chrome, no duplicate buttons.
-->
<script setup lang="ts">
import type { DataSchema, PseudoViewDelegate, ViewDefinition } from '../../engine/types'
import { useDelegate, provideDelegate } from './injection'
import NestedComponentWrapper from './NestedComponentWrapper.vue'

const props = defineProps<{
  view: ViewDefinition
  schema?: DataSchema | null
  validationSchema?: DataSchema | null
  data?: Record<string, unknown>
  lang: string
}>()
const emit = defineEmits<{ (e: 'apply', body: Record<string, unknown>): void; (e: 'close'): void }>()

// Bridge the transition view's own actions to this form's outcome, forwarding
// everything else to the host delegate.
const parent = useDelegate()
const bridged = new Proxy({} as PseudoViewDelegate, {
  get(_t, key) {
    if (key === 'onAction') {
      return (action: string, data: Record<string, unknown>, command?: string) => {
        if (action === 'submit') return void emit('apply', data)
        if (action === 'cancel') return void emit('close')
        return parent.onAction(action, data, command)
      }
    }
    return (parent as unknown as Record<string | symbol, unknown>)[key]
  },
})
provideDelegate(bridged)
void props
</script>

<template>
  <NestedComponentWrapper
    :schema="schema ?? { type: 'object', properties: {} }"
    :validation-schema="validationSchema ?? null"
    :view="view"
    :lang="lang"
    :bound-values="data ?? {}"
  />
</template>
