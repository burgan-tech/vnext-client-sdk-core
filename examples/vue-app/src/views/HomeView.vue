<script setup lang="ts">
import { NAV } from '../sdk/router';

const sdks = [
  { name: 'morph-api', role: 'HTTP client + OAuth2 transport', pkg: '@morph/core · oauth2 · logger · browser-storage' },
  { name: 'pseudo-ui', role: 'Server-driven UI renderer (Vue-only)', pkg: '@burgan-tech/pseudo-ui/vue' },
  { name: 'page-router', role: 'Navigation + view lifecycle shell', pkg: 'page-router · page-router-vue' },
  { name: 'context-store', role: 'Shared reactive state bus', pkg: '@burgantech/context-store' },
  { name: 'workflow-manager', role: 'Workflow state machine', pkg: 'amorphie-workflow-manager (+vue)' },
];
</script>

<template>
  <div class="view">
    <h1>vNext SDK — Integrated Vue Sample</h1>
    <p class="lead">
      All five vNext TypeScript SDKs wired into one Vue 3 app. Everything runs
      self-contained — MSW mocks the network for morph-api and an in-memory
      backend drives the workflow. No Keycloak or Docker required.
    </p>

    <div class="cards">
      <div v-for="s in sdks" :key="s.name" class="card">
        <h3>{{ s.name }}</h3>
        <p class="role">{{ s.role }}</p>
        <code>{{ s.pkg }}</code>
      </div>
    </div>

    <h2>Try it</h2>
    <ul class="hints">
      <li v-for="n in NAV.filter((x) => x.key !== 'home')" :key="n.key">
        <i :class="n.icon" /> <strong>{{ n.label }}</strong>
      </li>
    </ul>
    <p class="note">
      The <strong>Workflow (KYC)</strong> screen is the flagship integration:
      page-router hosts the view, workflow-manager drives the state machine, and
      each step is rendered by pseudo-ui — a pseudo-ui <em>submit</em> fires the
      next workflow transition.
    </p>
  </div>
</template>

<style scoped>
.view { max-width: 900px; }
.lead { font-size: 1.05rem; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.card { border: 1px solid var(--border); border-radius: 10px; padding: 1rem; background: var(--panel); }
.card h3 { margin: 0 0 .35rem; color: var(--accent); }
.card .role { margin: 0 0 .5rem; font-size: .9rem; }
.card code { font-size: .75rem; color: var(--muted); word-break: break-word; }
.hints { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .75rem; }
.hints li { border: 1px solid var(--border); border-radius: 999px; padding: .4rem .9rem; }
.note { background: var(--panel); border-left: 3px solid var(--accent); padding: .75rem 1rem; border-radius: 6px; }
</style>
