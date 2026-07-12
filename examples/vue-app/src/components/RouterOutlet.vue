<!--
  The `router` ContentOutlet target: renders a tab strip when the shell is in MDI
  (page-router only tracks tabs; drawing the tab bar is host chrome) above the
  active view. In SDI there is a single active view and no tab bar. The body
  scrolls independently so the master chrome (sidebar/appbar) stays fixed.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { ShellMode, type IPageRouter, type OpenTab } from 'page-router';
import { PageRouterShell, usePageRouter } from 'page-router-vue';
import type { LocalizedText } from '@burgan-tech/app-host';
import { localize } from '../sdk/i18n';

const props = defineProps<{ router: IPageRouter }>();
const state = usePageRouter(props.router);

const isMdi = computed(() => state.shellMode.value === ShellMode.mdi);
const tabs = computed(() => state.openTabs.value);
const activeKey = computed(() => state.activeTab.value?.tabKey);

function tabTitle(t: OpenTab): string {
  const item = t.item as { title?: LocalizedText; key?: string } | undefined;
  return localize(item?.title, state.locale.value) || item?.key || t.tabKey;
}
</script>

<template>
  <div class="router-outlet">
    <div v-if="isMdi && tabs.length" class="tabbar">
      <div
        v-for="t in tabs"
        :key="t.tabKey"
        class="tab"
        :class="{ active: t.tabKey === activeKey }"
        @click="router.activateTab(t.tabKey)"
      >
        <span>{{ tabTitle(t) }}</span>
        <button v-if="t.isClosable" class="x" title="Close" @click.stop="router.closeTab(t.tabKey)">×</button>
      </div>
    </div>
    <div class="router-body">
      <PageRouterShell :router="router" />
    </div>
  </div>
</template>

<style scoped>
.router-outlet { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.tabbar {
  display: flex; gap: .25rem; padding: .5rem .75rem 0; flex: 0 0 auto; overflow-x: auto;
  background: var(--color-surface, #fff); border-bottom: 1px solid var(--color-border, #e3e6ef);
}
.tab {
  display: flex; align-items: center; gap: .4rem; padding: .4rem .8rem; cursor: pointer; white-space: nowrap;
  font-size: .85rem; border: 1px solid var(--color-border, #e3e6ef); border-bottom: none;
  border-radius: 8px 8px 0 0; background: var(--color-hover, #f1f2f8);
}
.tab.active { background: var(--color-surface, #fff); font-weight: 600; }
.tab .x { border: none; background: transparent; cursor: pointer; font-size: 1rem; line-height: 1; color: var(--color-muted, #667); padding: 0 .1rem; }
.router-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 1.5rem 2rem; }
</style>
