<script setup lang="ts">
import { useConfirmState, resolveConfirm } from '../composables/useConfirm';

const state = useConfirmState();
</script>

<template>
  <Teleport to="body">
    <div v-if="state.open" class="backdrop" @click.self="resolveConfirm(false)">
      <div class="dialog" role="dialog" aria-modal="true">
        <h3 :class="{ danger: state.danger }">{{ state.title }}</h3>
        <p>{{ state.message }}</p>
        <div class="actions">
          <button class="btn ghost" @click="resolveConfirm(false)">
            {{ state.cancelLabel ?? 'Cancel' }}
          </button>
          <button class="btn" :class="{ danger: state.danger }" @click="resolveConfirm(true)">
            {{ state.confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, .45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog {
  background: var(--panel); color: inherit; border: 1px solid var(--border);
  border-radius: 12px; padding: 1.5rem; width: min(440px, 90vw);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
}
.dialog h3 { margin: 0 0 .5rem; }
.dialog h3.danger { color: #d33; }
.dialog p { margin: 0 0 1.25rem; color: var(--muted); }
.actions { display: flex; justify-content: flex-end; gap: .5rem; }
.btn { background: var(--accent); color: #fff; border: none; padding: .5rem 1.1rem; border-radius: 8px; cursor: pointer; }
.btn.ghost { background: transparent; color: inherit; border: 1px solid var(--border); }
.btn.danger { background: #d33; }
</style>
