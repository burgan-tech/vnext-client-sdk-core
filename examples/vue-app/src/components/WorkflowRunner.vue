<!--
  Drives a backend workflow instance via workflow-manager and renders the current
  state's server-driven view with pseudo-ui. Starts a NEW instance on mount
  (interactive flows like 2FA `user-login`); a pseudo-ui `submit` (command =
  transition key) fires the next transition. Emits `success` on a terminal state.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useWorkflow } from 'amorphie-workflow-manager-vue';
import type { ViewDefinition } from '@burgan-tech/pseudo-ui';
import PseudoRenderer from './PseudoRenderer.vue';
import { idmWorkflowManager } from '../boot/idmWorkflow';
import { createPkce, type Pkce } from '../boot/pkce';
import { contextStore } from '../sdk/context';
import { localize } from '../sdk/i18n';
import type { LocalizedText } from '@burgan-tech/app-host';

/** A start-payload field collected by a host form before the instance is started. */
export interface StartField {
  name: string;
  label?: LocalizedText;
  type?: string; // "password" | "text" | ...
}

const props = defineProps<{
  domain: string;
  name: string;
  version?: string;
  start?: Record<string, unknown>;
  /** Enable PKCE (authorization_code login): inject codeChallenge on `login`, keep verifier. */
  pkce?: boolean;
  /** Where the instance key comes from: "activeUser" → the logged-in userId. */
  keyFrom?: string;
  /** If set, collect these fields in a host form and start only on submit. */
  startFields?: StartField[];
  /** Active locale for field labels. */
  lang?: string;
}>();

// Instance key: some flows (e.g. user-change-password) resolve the subject from
// the instance key, so start keyed by the logged-in userId.
const startKey = computed<string | undefined>(() =>
  props.keyFrom === 'activeUser' ? (contextStore.activeUser ?? undefined) : undefined,
);
const needsForm = computed(() => (props.startFields?.length ?? 0) > 0);
const formModel = reactive<Record<string, string>>({});
const started = ref(false);
const flabel = (f: StartField) => localize(f.label, props.lang ?? 'en') || f.name;

const emit = defineEmits<{ (e: 'success', instanceId: string, extra: { codeVerifier?: string }): void }>();

const wf = useWorkflow({
  manager: idmWorkflowManager,
  domain: props.domain,
  name: props.name,
  ...(props.version ? { version: props.version } : {}),
});

const currentView = computed(() => (wf.view.value?.content ?? null) as ViewDefinition | null);
const instanceData = computed(() => (wf.data.value ?? {}) as Record<string, unknown>);

const errorText = computed(() => {
  const e = wf.error.value as unknown;
  if (!e) return '';
  if (typeof e === 'string') return e;
  const o = e as { message?: string; detail?: string; code?: string };
  return o.message ?? o.detail ?? o.code ?? JSON.stringify(e);
});

const instanceId = ref<string | undefined>();
let pkce: Pkce | undefined;

// Flows with a start form wait for user input; others start immediately on mount.
onMounted(() => {
  if (!needsForm.value) void begin();
});

async function begin() {
  if (props.pkce) pkce = await createPkce();
  started.value = true;
  const attributes = { ...(props.start ?? {}), ...(needsForm.value ? { ...formModel } : {}) };
  const res = await wf.start({
    attributes,
    ...(startKey.value ? { key: startKey.value } : {}),
    sync: true,
  });
  if (res.ok && res.instanceId) instanceId.value = res.instanceId;
}

/**
 * pseudo-ui view buttons carry `command` as either a raw transition key ("login")
 * or a URN ("urn:morph-idm:workflow:user-login:login"). The backend transition
 * endpoint expects the bare key, so take the last URN segment.
 */
function transitionKeyFrom(command: string): string {
  return command.startsWith('urn:') ? (command.split(':').pop() ?? command) : command;
}

async function onSubmit(payload: { command?: string; data: Record<string, unknown> }) {
  if (!payload.command) return;
  const key = transitionKeyFrom(payload.command);
  // PKCE: attach the codeChallenge on the `login` transition (redeemed later with the verifier).
  const body =
    pkce && key === 'login'
      ? { ...payload.data, codeChallenge: pkce.codeChallenge, codeChallengeMethod: pkce.codeChallengeMethod }
      : payload.data;
  await wf.transition({ transitionKey: key, body, sync: true });
}

async function fireTransition(key: string) {
  await wf.transition({ transitionKey: key, body: {}, sync: true });
}

// Surface a terminal success (e.g. login-success) to the host.
watch(
  () => [wf.isTerminal.value, wf.currentState.value] as const,
  ([terminal, state]) => {
    if ((terminal || String(state ?? '').includes('success')) && instanceId.value) {
      emit('success', instanceId.value, { codeVerifier: pkce?.codeVerifier });
    }
  },
);
</script>

<template>
  <div class="runner">
    <!-- Start form: collect the start payload before creating the instance. -->
    <form v-if="needsForm && !started" class="start-form" @submit.prevent="begin">
      <label v-for="f in startFields" :key="f.name" class="field">
        <span>{{ flabel(f) }}</span>
        <input v-model="formModel[f.name]" :type="f.type ?? 'text'" required autocomplete="off" />
      </label>
      <button type="submit" class="start-btn">Başlat</button>
    </form>

    <template v-else>
    <div class="statusbar">
      <span>state: <strong>{{ wf.currentState.value ?? '—' }}</strong></span>
      <span>status: <strong>{{ wf.status.value ?? '—' }}</strong></span>
      <span v-if="wf.loading.value" class="loading">⏳</span>
      <span v-if="wf.isTerminal.value" class="terminal">● terminal</span>
    </div>

    <div v-if="errorText" class="error">{{ errorText }}</div>

    <div v-if="!wf.ready.value" class="muted">Starting {{ domain }}/{{ name }}…</div>

    <template v-else>
      <PseudoRenderer v-if="currentView" :view="currentView" :instance-data="instanceData" @submit="onSubmit" />
      <p v-else class="muted">This state has no view.</p>

      <div v-if="wf.transitions.value.length" class="transitions">
        <span class="tlabel">transitions:</span>
        <button v-for="t in wf.transitions.value" :key="t.key" class="tbtn" @click="fireTransition(t.key)">
          {{ t.key }}
        </button>
      </div>
    </template>

    <details class="debug">
      <summary>workflow data</summary>
      <pre>{{ JSON.stringify(wf.data.value ?? {}, null, 2) }}</pre>
    </details>
    </template>
  </div>
</template>

<style scoped>
.runner { max-width: 640px; }
.start-form { display: flex; flex-direction: column; gap: .9rem; max-width: 360px; }
.start-form .field { display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; color: var(--color-muted, #667); }
.start-form .field input {
  padding: .55rem .7rem; border: 1px solid var(--color-border, #e3e6ef); border-radius: 8px;
  font-size: .95rem; background: var(--color-surface, #fff); color: var(--color-on-surface, #1f2430);
}
.start-btn {
  align-self: flex-start; padding: .55rem 1.2rem; border: none; border-radius: 8px; cursor: pointer;
  background: var(--color-primary, #4f46e5); color: #fff; font-size: .9rem; font-weight: 600;
}
.statusbar { display: flex; gap: 1rem; align-items: center; margin-bottom: .75rem; font-size: .9rem; }
.statusbar .loading { color: var(--accent, #4f46e5); }
.statusbar .terminal { color: #2a9d3f; }
.error { background: #fdecea; color: #b3261e; padding: .6rem .9rem; border-radius: 6px; margin-bottom: 1rem; }
.muted { color: var(--muted, #889); }
.transitions { display: flex; align-items: center; gap: .5rem; margin-top: 1rem; flex-wrap: wrap; }
.tlabel { font-size: .8rem; color: var(--muted, #889); }
.tbtn { background: transparent; color: var(--accent, #4f46e5); border: 1px solid var(--accent, #4f46e5); padding: .35rem .8rem; border-radius: 8px; cursor: pointer; font-size: .85rem; }
.debug { margin-top: 1.25rem; }
.debug pre { background: #0b1020; color: #cfe3ff; padding: 1rem; border-radius: 8px; overflow: auto; max-height: 240px; font-size: .72rem; }
</style>
