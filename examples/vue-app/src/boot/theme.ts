// ─────────────────────────────────────────────────────────────────────────
// Theme application (web adapter).
//
// A theme is a generic, platform-agnostic token set (loaded from the shell
// `theme` workflow). Here we map tokens → CSS custom properties on :root and
// bridge the key ones to PrimeVue's `--p-*` variables so both our chrome and
// PrimeVue components pick up the theme. (Parity: a Dart/RN adapter would map
// the same tokens → Material ThemeData.)
// ─────────────────────────────────────────────────────────────────────────
import { loadTheme } from './appHost';

export interface Theme {
  mode?: string;
  tokens?: Record<string, string>;
}

/** Apply a theme's tokens as CSS variables + PrimeVue bridges + color-scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const tokens = theme.tokens ?? {};

  // Every token → --<token-key> (e.g. color-primary → --color-primary).
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, String(v));

  // Bridge the load-bearing tokens to PrimeVue Aura's variables.
  const bridge: Record<string, string | undefined> = {
    '--p-primary-color': tokens['color-primary'],
    '--p-primary-contrast-color': tokens['color-on-primary'],
    '--p-content-background': tokens['color-surface'],
    '--p-text-color': tokens['color-on-surface'],
    '--p-content-border-color': tokens['color-border'],
    '--p-border-radius': tokens['radius'],
  };
  for (const [k, v] of Object.entries(bridge)) if (v) root.style.setProperty(k, v);

  root.dataset.themeMode = theme.mode ?? 'light';
  root.style.colorScheme = theme.mode === 'dark' ? 'dark' : 'light';
  if (theme.mode === 'dark') root.classList.add('dark-mode');
  else root.classList.remove('dark-mode');
}

/** Load a theme by key from the shell backend and apply it. Tolerant. */
export async function loadAndApplyTheme(key: string): Promise<void> {
  const theme = await loadTheme(key);
  if (theme) applyTheme(theme);
  else console.warn(`[theme] could not load "${key}"`);
}
