<script setup lang="ts">
import { ref } from 'vue';
import { useContextValue, setContextValue } from '../sdk/context';

// context-store as the shared reactive bus. `useContextValue` bridges an
// observed key into a Vue ref; other views (Pseudo-UI Form, Workflow) write to
// the same store and their values show up here reactively.
const theme = useContextValue<string>('demo/theme');
const lastCustomer = useContextValue<Record<string, unknown>>('demo/lastCustomer');
const lastInstance = useContextValue<string>('workflow/lastInstanceId');

const draft = ref('dark');
function saveTheme() {
  setContextValue('demo/theme', draft.value);
}
</script>

<template>
  <div class="view">
    <h1>Context Store</h1>
    <p class="lead">
      Shared state via <code>@burgantech/context-store</code>. Values written by
      other screens appear here reactively (subscribe → ref bridge).
    </p>

    <div class="panel">
      <h3>Write a value</h3>
      <div class="row">
        <input v-model="draft" placeholder="theme value" />
        <button class="btn" @click="saveTheme">Set demo/theme</button>
      </div>
      <p class="kv">demo/theme = <strong>{{ theme ?? '—' }}</strong></p>
    </div>

    <div class="panel">
      <h3>Values from other screens</h3>
      <p class="kv">workflow/lastInstanceId = <strong>{{ lastInstance ?? '—' }}</strong></p>
      <p class="kv">demo/lastCustomer =</p>
      <pre>{{ lastCustomer ? JSON.stringify(lastCustomer, null, 2) : '— (submit the Pseudo-UI Form)' }}</pre>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 720px; }
.panel { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; background: var(--panel); margin-bottom: 1rem; }
.panel h3 { margin-top: 0; }
.row { display: flex; gap: .5rem; }
.row input { flex: 1; padding: .5rem .7rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: inherit; }
.btn { background: var(--accent); color: #fff; border: none; padding: .5rem 1.1rem; border-radius: 8px; cursor: pointer; }
.kv { font-size: .95rem; }
pre { background: #0b1020; color: #cfe3ff; padding: 1rem; border-radius: 8px; overflow: auto; }
</style>
