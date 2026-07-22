<!--
  JsonView — PURE display for the `Json` view node: renders a value as
  syntax-highlighted JSON. No interaction state of its own (no toggle/CSS) — a
  view controls show/hide declaratively via the node's `visible` (Button `toggle`
  + `$ui`), so the same view definition behaves identically on web / Dart /
  native. See DynamicRenderer's Json branch.
-->
<script setup lang="ts">
import { highlightJson } from './jsonHighlight'

defineProps<{ value: unknown }>()
</script>

<template>
  <pre class="d-jsonview__json"><code v-html="highlightJson(value)"></code></pre>
</template>
