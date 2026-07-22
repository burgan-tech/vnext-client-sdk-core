// ─────────────────────────────────────────────────────────────────────────
// useHistory — shared transition-history surface logic for the two call sites
// (a list row's ⋯ menu and the detail toolbar). The SDK only does PLUMBING:
//   • resolve the config-referenced history view (client-config.views.transitionHistory),
//   • load it and read its OWN `display` (no config override): full-page → open
//     as a page/tab (navigate); otherwise embed the view in a modal,
//   • fetch the history rows and feed them to the view as `$instance.transitions`.
// History is config-owned: the layout/content (and per-row `{ }` raw via a `Json`
// node) all live in the backend view — there is no SDK fallback layout. Future
// history UX is authored there, not here.
// ─────────────────────────────────────────────────────────────────────────
import { ref } from 'vue'
import type { DataSchema, TransitionHistoryItem, ViewDefinition } from '../../engine/types'
import { useDelegate, useConfigViews } from './injection'

function isPageDisplay(d: unknown): boolean {
  const s = String(d ?? '').toLowerCase()
  return s === 'full-page' || s === 'page'
}

export interface HistoryIdentity {
  domain: string
  workflow: string
  instanceId: string
  title?: unknown
  subtitle?: string
}

export function useHistory() {
  const delegate = useDelegate()
  const configViews = useConfigViews()

  const open = ref(false)
  const loading = ref(false)
  const items = ref<TransitionHistoryItem[]>([])
  // A loaded config view to embed in the modal (null → caller renders the
  // built-in WorkflowHistory fallback).
  const viewDef = ref<ViewDefinition | null>(null)
  const schemaDef = ref<DataSchema | null>(null)

  function historyRef(): { key?: string } | undefined {
    return configViews['transitionHistory'] as { key?: string } | undefined
  }

  async function show(
    identity: HistoryIdentity,
    fetcher: () => Promise<TransitionHistoryItem[]>,
  ): Promise<void> {
    viewDef.value = null
    schemaDef.value = null
    const cfg = historyRef()
    if (cfg?.key && delegate.loadComponent) {
      try {
        const loaded = await delegate.loadComponent(cfg.key)
        const display = (loaded?.view as { display?: unknown } | undefined)?.display
        // The view's own display decides the surface — page → a routed tab.
        if (isPageDisplay(display) && delegate.onAction) {
          delegate.onAction('navigate', { key: cfg.key, payload: { ...identity } })
          return
        }
        viewDef.value = loaded?.view ?? null
        schemaDef.value = loaded?.schema ?? null
      } catch {
        // fall through to the built-in fallback (viewDef stays null)
      }
    }
    open.value = true
    loading.value = true
    try {
      items.value = await fetcher()
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  return { open, loading, items, viewDef, schemaDef, show }
}
