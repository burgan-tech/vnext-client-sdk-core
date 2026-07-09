<script setup lang="ts">
import { ref } from 'vue';
import { morph, SERVICE_AUTH_ID } from '../sdk/morph';

// Demonstrates morph-api: a non-interactive client_credentials token is acquired
// automatically, then an authenticated GET is made. Both the token endpoint and
// the API are mocked by MSW (see src/mocks/handlers.ts).
const loading = ref(false);
const result = ref<unknown>(null);
const error = ref<string | null>(null);

async function callAccounts() {
  loading.value = true;
  error.value = null;
  result.value = null;
  try {
    const res = await morph.host('demo-api').get('/accounts', { auth: SERVICE_AUTH_ID });
    result.value = { statusCode: res.statusCode, body: res.body };
  } catch (e) {
    error.value = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="view">
    <h1>Morph API</h1>
    <p class="lead">
      <code>morph-api</code> acquires a client-credentials token and calls a
      protected endpoint. Network is mocked in-browser by MSW.
    </p>

    <div class="panel">
      <button class="btn" :disabled="loading" @click="callAccounts">
        {{ loading ? 'Calling…' : 'GET /accounts (authenticated)' }}
      </button>

      <div v-if="error" class="error">{{ error }}</div>

      <div v-if="result" class="result">
        <h3>Response</h3>
        <pre>{{ JSON.stringify(result, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 720px; }
.panel { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; background: var(--panel); }
.btn { background: var(--accent); color: #fff; border: none; padding: .6rem 1.2rem; border-radius: 8px; cursor: pointer; font-size: .95rem; }
.btn:disabled { opacity: .6; cursor: default; }
.error { background: #fdecea; color: #b3261e; padding: .6rem .9rem; border-radius: 6px; margin-top: 1rem; }
.result { margin-top: 1rem; }
.result pre { background: #0b1020; color: #cfe3ff; padding: 1rem; border-radius: 8px; overflow: auto; }
</style>
