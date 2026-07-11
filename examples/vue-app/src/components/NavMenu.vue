<!--
  Dynamic navigation menu injected into the master layout's `nav` ContentOutlet.
  The chrome LAYOUT is backend-defined (master View); this renders the dynamic,
  navigable item list (pseudo-ui can't cleanly express a data-bound navigable
  list — command isn't expression-resolved — so the dynamic nav is host-rendered
  in a backend-placed outlet).
-->
<script setup lang="ts">
import type { IPageRouter } from 'page-router';
import type { NavItem } from '@burgan-tech/app-host';

const props = defineProps<{ items: NavItem[]; router: IPageRouter }>();

function go(key?: string): void {
  if (key) void props.router.navigate({ routeKey: key });
}
</script>

<template>
  <nav class="navmenu">
    <template v-for="it in items" :key="it.key ?? it.type">
      <button
        v-if="it.key && it.type !== 'group' && it.type !== 'divider'"
        class="nav-item"
        @click="go(it.key)"
      >{{ it.title ?? it.key }}</button>
      <div v-else-if="it.type === 'group'" class="nav-group">
        <div class="nav-group-title">{{ it.title }}</div>
        <button
          v-for="c in (it.children ?? [])"
          :key="c.key"
          class="nav-item child"
          @click="go(c.key)"
        >{{ c.title ?? c.key }}</button>
      </div>
    </template>
  </nav>
</template>

<style scoped>
.navmenu { display: flex; flex-direction: column; gap: .25rem; }
.nav-item {
  text-align: left; background: transparent; border: none; color: inherit; cursor: pointer;
  padding: .55rem .7rem; border-radius: 8px; font-size: .92rem;
}
.nav-item:hover { background: var(--hover, #1e1e28); }
.nav-item.child { padding-left: 1.2rem; font-size: .88rem; opacity: .9; }
.nav-group { display: flex; flex-direction: column; gap: .15rem; }
.nav-group-title { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted, #889); padding: .4rem .7rem 0; }
</style>
