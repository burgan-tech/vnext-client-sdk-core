<!--
  Profile menu injected into the master layout's `profile` ContentOutlet (top-right
  of the AppBar). The chrome PLACEMENT is backend-defined (master View); this
  renders the interactive account dropdown (Hepsiburada "Hesabım" pattern):
  session status flags, login/logout, and the dev token-level + shell-mode
  switches — all the controls that used to sit loose in the sidebar.
-->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { ShellMode, type IPageRouter } from 'page-router';
import { usePageRouter } from 'page-router-vue';
import type { NavItem, TokenLevel } from '@burgan-tech/app-host';
import { localize } from '../sdk/i18n';

const props = defineProps<{
  router: IPageRouter;
  tokenLevel: TokenLevel;
  navItems: NavItem[];
  status: { registered: string; contexts: Array<{ key: string; ok: boolean }> };
  onToken: (level: TokenLevel) => void;
  onLogout: () => void;
}>();

function itemTitle(it: NavItem): string {
  return localize(it.title, locale.value) || it.key || '';
}

const state = usePageRouter(props.router);
const mode = computed(() => state.shellMode.value);
const locale = computed(() => state.locale.value);
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const isLoggedIn = computed(() => props.tokenLevel !== 'device');
const identity = computed(() => (isLoggedIn.value ? 'Hesabım' : 'Misafir'));

function close(): void {
  open.value = false;
}
function onClickOutside(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) close();
}
onMounted(() => document.addEventListener('mousedown', onClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside));

function go(it: NavItem): void {
  close();
  if (it.key) void props.router.navigate({ routeKey: it.key });
}
function logout(): void {
  close();
  props.onLogout();
}
function setToken(level: TokenLevel): void {
  props.onToken(level);
}
function setMode(m: ShellMode): void {
  void props.router.setShellMode(m);
}
function setLocale(l: string): void {
  props.router.setLocale(l);
}
</script>

<template>
  <div ref="root" class="profile">
    <button class="profile-trigger" :aria-expanded="open" @click="open = !open">
      <span class="avatar">{{ isLoggedIn ? '👤' : '🔒' }}</span>
      <span class="name">{{ identity }}</span>
      <span class="caret">▾</span>
    </button>

    <div v-if="open" class="profile-panel">
      <div class="panel-section">
        <div class="section-title">Oturum</div>
        <div class="status-row">
          <span class="badge" :class="tokenLevel">{{ tokenLevel }}</span>
          <span class="muted">{{ status.registered }}</span>
        </div>
        <div class="status-flags">
          <span v-for="c in status.contexts" :key="c.key">{{ c.key }} {{ c.ok ? '✓' : '·' }}</span>
        </div>
      </div>

      <div v-if="navItems.length || isLoggedIn" class="panel-section">
        <button
          v-for="it in navItems"
          :key="it.key"
          class="menu-item"
          :class="{ primary: !isLoggedIn && it.type === 'workflow' }"
          @click="go(it)"
        >{{ itemTitle(it) }}</button>
        <button v-if="isLoggedIn" class="menu-item danger" @click="logout">Çıkış Yap</button>
      </div>

      <div class="panel-section">
        <div class="section-title">Dil / Language</div>
        <div class="switch-row">
          <button class="pill" :class="{ active: locale === 'tr' }" @click="setLocale('tr')">TR</button>
          <button class="pill" :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">Ekran Modu</div>
        <div class="switch-row">
          <button class="pill" :class="{ active: mode === ShellMode.sdi }" @click="setMode(ShellMode.sdi)">SDI</button>
          <button class="pill" :class="{ active: mode === ShellMode.mdi }" @click="setMode(ShellMode.mdi)">MDI</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">Token Seviyesi</div>
        <div class="switch-row">
          <button class="pill" :class="{ active: tokenLevel === 'device' }" @click="setToken('device')">device</button>
          <button class="pill" :class="{ active: tokenLevel === '1fa' }" @click="setToken('1fa')">1fa</button>
          <button class="pill" :class="{ active: tokenLevel === '2fa' }" @click="setToken('2fa')">2fa</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile { position: relative; }
.profile-trigger {
  display: flex; align-items: center; gap: .4rem; cursor: pointer;
  background: transparent; border: 1px solid var(--color-border, #e3e6ef);
  border-radius: 999px; padding: .3rem .6rem; color: inherit; font-size: .88rem;
}
.profile-trigger:hover { background: var(--color-hover, #f1f2f8); }
.avatar { font-size: 1rem; }
.caret { opacity: .6; }
.profile-panel {
  position: absolute; right: 0; top: calc(100% + .4rem); z-index: 50;
  min-width: 240px; background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e3e6ef); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .16); padding: .5rem;
  display: flex; flex-direction: column; gap: .35rem;
}
.panel-section { display: flex; flex-direction: column; gap: .3rem; padding: .35rem .25rem; }
.panel-section + .panel-section { border-top: 1px solid var(--color-border, #eef); }
.section-title { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-muted, #889); }
.status-row { display: flex; align-items: center; gap: .5rem; }
.status-flags { display: flex; gap: .6rem; font-size: .78rem; color: var(--color-muted, #667); }
.badge { font-size: .72rem; font-weight: 700; padding: .1rem .45rem; border-radius: 6px; background: var(--color-hover, #eef); text-transform: uppercase; }
.badge.device { color: #667; }
.badge\.1fa, .badge.\32 fa { color: var(--color-primary, #4f46e5); }
.muted { font-size: .78rem; color: var(--color-muted, #667); }
.menu-item {
  text-align: left; background: transparent; border: none; cursor: pointer;
  padding: .5rem .55rem; border-radius: 8px; font-size: .9rem; color: inherit;
}
.menu-item:hover { background: var(--color-hover, #f1f2f8); }
.menu-item.primary { color: var(--color-primary, #4f46e5); font-weight: 600; }
.menu-item.danger { color: #d13b3b; font-weight: 600; }
.switch-row { display: flex; gap: .3rem; }
.pill {
  flex: 1; cursor: pointer; padding: .35rem .4rem; font-size: .8rem;
  border: 1px solid var(--color-border, #e3e6ef); border-radius: 8px;
  background: transparent; color: inherit;
}
.pill:hover { background: var(--color-hover, #f1f2f8); }
.pill.active { background: var(--color-primary, #4f46e5); color: #fff; border-color: var(--color-primary, #4f46e5); }
</style>
