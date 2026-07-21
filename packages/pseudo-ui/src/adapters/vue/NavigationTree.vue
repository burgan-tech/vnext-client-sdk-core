<!--
  NavigationTree — recursive renderer for the Amorphie nav list, supporting nested
  groups (a group whose children include further groups). Groups are expandable
  (config.defaultExpanded; top level defaults open); leaves emit the `navigate`
  intent via the delegate. Self-referencing for arbitrary depth. Generic — the
  items come from backend navigation config.
-->
<script setup lang="ts">
import { reactive } from 'vue'
import { localizeLabel } from '../../engine/expressionResolver'
import { useDelegate } from './injection'
import { useFormContext } from './useFormContext'

const props = defineProps<{ items: Record<string, unknown>[]; depth?: number }>()
const delegate = useDelegate()
const ctx = useFormContext()
const depth = props.depth ?? 0

const expanded = reactive<Record<string, boolean>>({})

// `hidden` items are routable (navigation targets, e.g. a per-record detail) but
// not shown in the sidebar.
const shown = (list: Record<string, unknown>[]): Record<string, unknown>[] =>
  list.filter((it) => it.hidden !== true)
const visibleItems = (): Record<string, unknown>[] => shown(props.items)

const isGroup = (it: Record<string, unknown>): boolean => it.type === 'group'
const childrenOf = (it: Record<string, unknown>): Record<string, unknown>[] =>
  shown((it.children as Record<string, unknown>[]) ?? [])
const label = (it: Record<string, unknown>): string => localizeLabel(it.title, ctx.lang) || String(it.key ?? '')
const keyOf = (it: Record<string, unknown>): string => String(it.key ?? '')

function isOpen(it: Record<string, unknown>): boolean {
  const k = keyOf(it)
  if (expanded[k] === undefined) {
    expanded[k] = (it.config as { defaultExpanded?: boolean } | undefined)?.defaultExpanded ?? depth === 0
  }
  return expanded[k]
}
function toggle(it: Record<string, unknown>): void {
  expanded[keyOf(it)] = !isOpen(it)
}
function navigate(it: Record<string, unknown>): void {
  void delegate.onAction?.('navigate', it)
}
</script>

<template>
  <div class="d-navtree">
    <template v-for="(it, i) in visibleItems()" :key="keyOf(it) || i">
      <hr v-if="it.type === 'divider'" class="d-nav-divider" />
      <template v-else-if="isGroup(it)">
        <button
          type="button"
          class="d-nav-group__title"
          :class="{ 'd-nav-group__title--open': isOpen(it) }"
          :style="{ paddingLeft: `${0.2 + depth * 0.85}rem` }"
          @click="toggle(it)"
        >
          <span class="d-nav-caret">{{ isOpen(it) ? '▾' : '▸' }}</span>{{ label(it) }}
        </button>
        <div v-show="isOpen(it)" class="d-nav-children">
          <NavigationTree :items="childrenOf(it)" :depth="depth + 1" />
        </div>
      </template>
      <button
        v-else-if="it.key"
        type="button"
        class="d-nav-item"
        :style="{ paddingLeft: `${0.7 + depth * 0.85}rem` }"
        @click="navigate(it)"
      >{{ label(it) }}</button>
    </template>
  </div>
</template>
