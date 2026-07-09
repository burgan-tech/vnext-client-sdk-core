<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  listClients,
  createClient,
  isProtected,
  type ClientSnapshot,
} from '../sdk/clients';
import { workflowManager, WORKFLOW_DOMAIN, WORKFLOW_NAME } from '../sdk/workflow';
import { getRouter } from '../sdk/router';
import { confirm } from '../composables/useConfirm';

const items = ref<ClientSnapshot[]>([]);
const page = ref(1);
const pageSize = 10;
const hasNext = ref(false);
const hasPrev = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

const newName = ref('');
const busyKey = ref<string | null>(null);

onMounted(() => void load(1));

async function load(p: number) {
  loading.value = true;
  error.value = null;
  try {
    const res = await listClients(p, pageSize);
    items.value = res.items;
    page.value = p;
    hasNext.value = res.hasNext;
    hasPrev.value = res.hasPrev;
    if (!res.ok) error.value = res.error ?? 'query failed';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[clients] queryInstances failed', e);
  } finally {
    loading.value = false;
  }
}

function open(c: ClientSnapshot) {
  void getRouter().navigate({
    routeKey: 'client-detail',
    extraData: { instanceKey: c.key ?? c.id },
  });
}

async function deactivate(c: ClientSnapshot) {
  const ok = await confirm({
    title: 'Deactivate client?',
    message: `"${c.key}" will transition active → passive on the real backend.`,
    confirmLabel: 'Deactivate',
    danger: true,
  });
  if (!ok) return;
  busyKey.value = c.key ?? c.id;
  try {
    const res = await workflowManager.startTransition({
      domain: WORKFLOW_DOMAIN,
      name: WORKFLOW_NAME,
      instanceId: c.id,
      transitionKey: 'passive',
      body: {},
    });
    if (!res.ok) error.value = res.error?.message ?? 'transition failed';
    await load(page.value);
  } finally {
    busyKey.value = null;
  }
}

async function create() {
  const name = newName.value.trim();
  if (name.length < 3) {
    error.value = 'Client name must be at least 3 characters.';
    return;
  }
  const ok = await confirm({
    title: 'Create client?',
    message: `A new draft client "${name}" will be created on the real backend (tagged sample/manual).`,
    confirmLabel: 'Create',
  });
  if (!ok) return;
  loading.value = true;
  try {
    const res = await createClient(name);
    if (!res.ok) {
      error.value = res.error ?? 'create failed';
      return;
    }
    newName.value = '';
    if (res.instanceId) open({ id: res.instanceId } as ClientSnapshot);
    else await load(1);
  } finally {
    loading.value = false;
  }
}

function stateClass(state?: string) {
  return `badge state-${state ?? 'unknown'}`;
}
</script>

<template>
  <div class="view">
    <h1>Clients — morph-idm</h1>
    <p class="lead">
      Each client is an instance of the <code>client</code> workflow. Listed via
      <code>queryInstances</code>, driven through <code>morph-api</code> against
      the real <code>test-vnext-morph-idm</code> backend.
    </p>

    <div class="create">
      <input v-model="newName" placeholder="New client name…" @keyup.enter="create" />
      <button class="btn" :disabled="loading" @click="create">+ New client</button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="tablewrap">
      <table>
        <thead>
          <tr><th>Key</th><th>State</th><th>Status</th><th>Tags</th><th>Actions</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in items" :key="c.id">
            <td class="mono">{{ c.key ?? c.id }}</td>
            <td><span :class="stateClass(c.currentState)">{{ c.currentState ?? '—' }}</span></td>
            <td>{{ c.status }}</td>
            <td class="tags">
              <span v-for="t in c.tags ?? []" :key="t" class="tag">{{ t }}</span>
            </td>
            <td class="actions">
              <button class="btn ghost sm" @click="open(c)">Open</button>
              <button
                v-if="c.currentState === 'active' && !isProtected(c)"
                class="btn danger sm"
                :disabled="busyKey === (c.key ?? c.id)"
                @click="deactivate(c)"
              >
                Deactivate
              </button>
              <span v-else-if="isProtected(c)" class="protected" title="migration/fact client — protected">🔒</span>
            </td>
          </tr>
          <tr v-if="!items.length && !loading">
            <td colspan="5" class="empty">No clients.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pager">
      <button class="btn ghost sm" :disabled="!hasPrev || loading" @click="load(page - 1)">‹ Prev</button>
      <span>page {{ page }}</span>
      <button class="btn ghost sm" :disabled="!hasNext || loading" @click="load(page + 1)">Next ›</button>
      <span v-if="loading" class="loading">⏳</span>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 960px; }
.create { display: flex; gap: .5rem; margin: 1rem 0; }
.create input { flex: 1; padding: .55rem .8rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: inherit; }
.tablewrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--border); }
th { background: var(--hover); font-weight: 600; }
tr:last-child td { border-bottom: none; }
.mono { font-family: ui-monospace, monospace; font-size: .82rem; }
.badge { padding: .15rem .55rem; border-radius: 999px; font-size: .75rem; font-weight: 600; }
.state-active { background: #dcfce7; color: #166534; }
.state-passive { background: #fee2e2; color: #991b1b; }
.state-draft { background: #fef9c3; color: #854d0e; }
.state-unknown { background: var(--hover); color: var(--muted); }
.tags { max-width: 220px; }
.tag { display: inline-block; background: var(--hover); border-radius: 4px; padding: .05rem .4rem; font-size: .7rem; margin: 0 .2rem .2rem 0; }
.actions { display: flex; gap: .4rem; align-items: center; }
.protected { font-size: 1rem; }
.btn { background: var(--accent); color: #fff; border: none; padding: .5rem 1rem; border-radius: 8px; cursor: pointer; }
.btn.sm { padding: .3rem .7rem; font-size: .8rem; }
.btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.btn.danger { background: #d33; color: #fff; }
.btn:disabled { opacity: .5; cursor: default; }
.pager { display: flex; align-items: center; gap: .75rem; margin-top: 1rem; }
.error { background: #fdecea; color: #b3261e; padding: .6rem .9rem; border-radius: 6px; margin: .5rem 0; }
.empty { text-align: center; color: var(--muted); padding: 1.5rem; }
</style>
