import type {
  ActionDescriptor,
  ActionDispatchContext,
  ActionHook,
  FormContext,
  LogLevel,
  PseudoViewDelegate,
} from './types'
import { isReservedAction } from './actionVocabulary'

/**
 * Framework-agnostic action pipeline.
 *
 * One async function — `dispatchAction` — owns the entire dispatch flow
 * (array fanout, `select`/`reset` short-circuits, validation gate,
 * pre-hook → main → post-hook orchestration). Each adapter
 * (`DynamicRenderer`) wires its framework-specific writes through
 * `ActionPipelineDeps` and calls `dispatchAction` — the three near
 * identical 60-line `handleAction` copies collapse into one engine
 * module.
 *
 * Hook orchestration rules:
 *   - Hooks fire only when the main dispatch actually reaches the host.
 *     `select` short-circuits (host never called) skip hooks entirely.
 *     A validation failure skips hooks.
 *   - `reset` runs hooks normally (`reset` DOES reach the host).
 *   - `sync: true` hook → awaited. Pre-hook rejection aborts the
 *     pipeline; post-hook rejection logs `error` and continues.
 *   - `sync: false` hook (default) → fire-and-forget; rejection logs
 *     `warn` and the pipeline never blocks on it.
 *   - Reserved verbs (`submit`/`select`/`reset`) in hooks are skipped
 *     with a `warn` log — hooks are side-channel signals and must not
 *     trigger SDK-internal behaviour.
 *
 * `dispatchAction` is wrapped in a try/catch so it never throws out of
 * a click handler — last-ditch failures surface via `log('error', ...)`.
 */

export type LogFn = (
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) => void

export interface ActionPipelineDeps {
  ctx: FormContext
  /**
   * MUST reference the live delegate — adapters wrap their delegate in
   * a `Proxy` so a host swap takes effect immediately. The pipeline
   * always reads `delegate.onAction` (not a destructured local) so the
   * Proxy `get` trap runs on every call. Do not destructure.
   */
  delegate: PseudoViewDelegate
  log: LogFn
  /** Snapshot fn so adapters can copy ctx.formData with their preferred semantics. */
  snapshotFormData: () => Record<string, unknown>
  /**
   * Notify the framework that ctx state changed (React `forceUpdate`,
   * Angular `markForCheck`). No-op for Vue (reactive). Called after
   * `select` / `reset` side effects.
   */
  notifyChange?: () => void
  /**
   * Apply the SDK-internal `select` side effect (write to `$ui.*` or
   * `$form.*`). Adapter-specific because path writes differ
   * (Vue uses dotted writeForm helper, React uses its own, Angular too).
   */
  applySelect: (descriptor: ActionDescriptor, item?: Record<string, unknown>) => void
  /** Apply the SDK-internal `toggle` side effect: flip the boolean at `descriptor.bind`
   *  (typically a `$ui.*` flag, e.g. a dropdown open/close). Adapter-specific. */
  applyToggle: (descriptor: ActionDescriptor) => void
  /** Clear ctx.formData + ctx.errors (adapter-specific because Vue reactive
   *  needs the explicit Object.keys iteration). */
  applyReset: () => void
  /**
   * Run all-field validation. Returns true when validation passed
   * (no errors). When false, the adapter has already surfaced a
   * UI-level error (toast/snackbar) before returning.
   */
  runValidation: () => boolean
}

/**
 * Run a single hook through the delegate. Sync hooks are awaited
 * (rejection bubbles to the caller as a thrown error); async hooks are
 * fire-and-forget with their rejection captured to the log.
 *
 * The caller decides what to do with a sync-hook rejection (pre →
 * abort, post → continue).
 */
async function runHook(
  hook: ActionHook,
  phase: 'pre' | 'post',
  parent: { action: string; command?: string },
  deps: ActionPipelineDeps,
): Promise<void> {
  if (isReservedAction(hook.action)) {
    deps.log('warn', `Hook ignored: reserved verb "${hook.action}" is not allowed in hooks`, undefined, {
      source: 'ActionPipeline',
      phase,
      hook: hook.action,
    })
    return
  }
  const sync = hook.sync === true
  const context: ActionDispatchContext = { phase, sync, parent }
  const snapshot = deps.snapshotFormData()
  deps.log('debug', `Hook fired: ${phase}/${hook.action}`, undefined, {
    source: 'ActionPipeline',
    phase,
    hook: hook.action,
    command: hook.command,
    sync,
    parent,
  })
  if (sync) {
    // Caller catches and decides.
    await deps.delegate.onAction(hook.action, snapshot, hook.command, context)
    return
  }
  // Fire-and-forget. Capture rejection at warn level; never throw.
  Promise.resolve()
    .then(() => deps.delegate.onAction(hook.action, snapshot, hook.command, context))
    .catch((err) => {
      deps.log('warn', `Async hook rejected: ${phase}/${hook.action}`, err, {
        source: 'ActionPipeline',
        phase,
        hook: hook.action,
        parent,
      })
    })
}

/**
 * Core pipeline. Handles a single (non-array) action — `dispatchAction`
 * peels array fanout above this.
 */
async function dispatchSingle(
  descriptor: string | ActionDescriptor,
  deps: ActionPipelineDeps,
  command: string | undefined,
  peerValidate: boolean | undefined,
  item: Record<string, unknown> | undefined,
): Promise<void> {
  // SDK-internal: select → adapter writes the bind, host is NOT called.
  // Hooks are skipped because no host dispatch happens.
  if (typeof descriptor === 'object' && descriptor.action === 'select' && descriptor.bind && descriptor.value !== undefined) {
    deps.applySelect(descriptor, item)
    deps.notifyChange?.()
    return
  }

  // SDK-internal: toggle → adapter flips the boolean at `bind` (e.g. $ui.open). Host NOT called.
  if (typeof descriptor === 'object' && descriptor.action === 'toggle' && descriptor.bind) {
    deps.applyToggle(descriptor)
    deps.notifyChange?.()
    return
  }

  const verb = typeof descriptor === 'string' ? descriptor : descriptor.action
  const cmd = typeof descriptor === 'string' ? command : (descriptor.command ?? command)
  const preHooks = typeof descriptor === 'object' ? (descriptor.preHooks ?? []) : []
  const postHooks = typeof descriptor === 'object' ? (descriptor.postHooks ?? []) : []
  const hasHooks = preHooks.length > 0 || postHooks.length > 0

  // SDK-internal: reset → adapter clears state, host IS still called.
  // Hooks run normally because reset reaches the host.
  if (verb === 'reset') {
    deps.applyReset()
    deps.notifyChange?.()
    deps.log('info', 'Form reset', undefined, { source: 'Action', action: 'reset' })
    await dispatchMainWithHooks('reset', cmd, preHooks, postHooks, hasHooks, deps)
    return
  }

  // Effective validate flag — descriptor override > peer flag > submit default.
  const shouldValidate =
    typeof descriptor === 'string'
      ? (peerValidate ?? verb === 'submit')
      : (descriptor.validate ?? verb === 'submit')

  if (shouldValidate) {
    const passed = deps.runValidation()
    deps.notifyChange?.()
    if (!passed) {
      // Validation failed → hooks NEVER fire. Adapter has already
      // surfaced the error UI (toast/snackbar) inside runValidation.
      return
    }
  }

  deps.log('info', `Action dispatched: "${verb}"`, undefined, {
    source: 'Action',
    action: verb,
    command: cmd,
    validated: shouldValidate,
  })
  await dispatchMainWithHooks(verb, cmd, preHooks, postHooks, hasHooks, deps)
}

/**
 * Run pre-hooks → main → post-hooks. Sync pre-hook rejection aborts;
 * main rejection skips post-hooks; sync post-hook rejection continues
 * with the next post-hook.
 *
 * `hasHooks` controls the 4th `context` argument on the main call —
 * when no hooks are declared, the main call uses the legacy 3-arg
 * signature so existing tests / hosts see no behavioural change.
 */
async function dispatchMainWithHooks(
  verb: string,
  cmd: string | undefined,
  preHooks: ActionHook[],
  postHooks: ActionHook[],
  hasHooks: boolean,
  deps: ActionPipelineDeps,
): Promise<void> {
  const parent = { action: verb, command: cmd }

  // Pre-hooks (declared order). Sync rejection → abort.
  for (const hook of preHooks) {
    try {
      await runHook(hook, 'pre', parent, deps)
    } catch (err) {
      deps.log('error', `Pre-hook rejected — aborting pipeline: pre/${hook.action}`, err, {
        source: 'ActionPipeline',
        phase: 'pre',
        hook: hook.action,
        parent,
      })
      return
    }
  }

  // Main dispatch.
  try {
    if (hasHooks) {
      const mainCtx: ActionDispatchContext = { phase: 'main', sync: true, parent: undefined }
      await deps.delegate.onAction(verb, deps.snapshotFormData(), cmd, mainCtx)
    } else {
      // Backward-compat: 3-arg call when no hooks are declared.
      await deps.delegate.onAction(verb, deps.snapshotFormData(), cmd)
    }
  } catch (err) {
    deps.log('error', `Main dispatch rejected: ${verb}`, err, {
      source: 'ActionPipeline',
      action: verb,
      command: cmd,
    })
    return
  }

  // Post-hooks (declared order). Sync rejection → log + continue.
  for (const hook of postHooks) {
    try {
      await runHook(hook, 'post', parent, deps)
    } catch (err) {
      deps.log('error', `Post-hook rejected — continuing: post/${hook.action}`, err, {
        source: 'ActionPipeline',
        phase: 'post',
        hook: hook.action,
        parent,
      })
    }
  }
}

/**
 * Public entry point. Handles array fanout and final safety net so a
 * pipeline crash can never escape a click handler.
 */
export async function dispatchAction(
  action: string | ActionDescriptor | ActionDescriptor[],
  deps: ActionPipelineDeps,
  command?: string,
  peerValidate?: boolean,
  item?: Record<string, unknown>,
): Promise<void> {
  try {
    if (Array.isArray(action)) {
      for (const entry of action) {
        await dispatchSingle(entry, deps, command, peerValidate, item)
      }
      return
    }
    await dispatchSingle(action, deps, command, peerValidate, item)
  } catch (err) {
    // Last-ditch safety net — adapters call dispatchAction from event
    // handlers without `.catch`, so swallow and log.
    deps.log('error', 'Action pipeline crashed', err, { source: 'ActionPipeline' })
  }
}

/**
 * Read the hooks declared on an action descriptor. Returns empty arrays
 * for string actions (hooks require the object form) or descriptors
 * with no hooks declared.
 */
export function getActionHooks(
  action: string | ActionDescriptor,
): { preHooks: ActionHook[]; postHooks: ActionHook[] } {
  if (typeof action === 'string') return { preHooks: [], postHooks: [] }
  return { preHooks: action.preHooks ?? [], postHooks: action.postHooks ?? [] }
}
