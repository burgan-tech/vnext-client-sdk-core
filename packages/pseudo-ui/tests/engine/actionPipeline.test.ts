import { describe, it, expect, vi } from 'vitest'
import { dispatchAction, type ActionPipelineDeps } from '../../src/engine/actionPipeline'
import type {
  ActionDescriptor,
  ActionDispatchContext,
  FormContext,
  PseudoViewDelegate,
} from '../../src/engine/types'

// Pipeline tests use a stub delegate + synthetic FormContext. We don't
// care about validation logic here (the adapter owns `runValidation`)
// — only the orchestration: order of calls, sync abort, async
// fire-and-forget, select/reset short-circuits, reserved-verb gating,
// and backward-compat (no 4th arg when there are no hooks).

function makeCtx(): FormContext {
  return {
    schema: { $id: 'pipeline-test', type: 'object', properties: {} },
    lang: 'en',
    formData: {},
    errors: {},
    instanceData: {},
    params: {},
    uiState: {},
    lovData: {},
    lookupData: {},
    designerMode: false,
  } as FormContext
}

function makeDeps(
  delegate: PseudoViewDelegate,
  overrides: Partial<ActionPipelineDeps> = {},
): ActionPipelineDeps {
  const ctx = makeCtx()
  return {
    ctx,
    delegate,
    log: vi.fn(),
    snapshotFormData: () => ({ ...ctx.formData }),
    applySelect: vi.fn(),
    applyReset: vi.fn(),
    runValidation: () => true,
    ...overrides,
  }
}

function makeDelegate(onAction: PseudoViewDelegate['onAction']): PseudoViewDelegate {
  return {
    async requestData() { throw new Error('unexpected') },
    async loadComponent() { throw new Error('unexpected') },
    onAction,
  }
}

describe('actionPipeline — hook orchestration', () => {
  it('fires pre → main → post in declared order', async () => {
    const calls: Array<{ action: string; phase: string | undefined }> = []
    const delegate = makeDelegate(async (action, _data, _cmd, ctx) => {
      calls.push({ action, phase: ctx?.phase })
    })
    const desc: ActionDescriptor = {
      action: 'dispatch',
      command: 'urn:main',
      preHooks: [{ action: 'audit', command: 'urn:audit', sync: true }],
      postHooks: [{ action: 'telemetry', command: 'urn:tel' }],
    }
    await dispatchAction(desc, makeDeps(delegate))
    expect(calls.map(c => `${c.phase}/${c.action}`)).toEqual([
      'pre/audit',
      'main/dispatch',
      'post/telemetry',
    ])
  })

  it('sync pre-hook rejection aborts the pipeline (main + post skipped)', async () => {
    const calls: string[] = []
    const delegate = makeDelegate(async (action) => {
      calls.push(action)
      if (action === 'audit') throw new Error('audit refused')
    })
    const log = vi.fn()
    const desc: ActionDescriptor = {
      action: 'dispatch',
      preHooks: [{ action: 'audit', sync: true }],
      postHooks: [{ action: 'telemetry' }],
    }
    await dispatchAction(desc, makeDeps(delegate, { log }))
    expect(calls).toEqual(['audit'])
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('aborting'),
      expect.any(Error),
      expect.objectContaining({ phase: 'pre', hook: 'audit' }),
    )
  })

  it('async pre-hook rejection does NOT block the main dispatch', async () => {
    const mainCalled = vi.fn()
    const delegate = makeDelegate(async (action) => {
      if (action === 'audit') throw new Error('async fail')
      if (action === 'dispatch') mainCalled()
    })
    const log = vi.fn()
    const desc: ActionDescriptor = {
      action: 'dispatch',
      preHooks: [{ action: 'audit' /* sync: false default */ }],
    }
    await dispatchAction(desc, makeDeps(delegate, { log }))
    expect(mainCalled).toHaveBeenCalled()
    // Async hook rejection lands as a microtask — flush it.
    await new Promise(r => setTimeout(r, 0))
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Async hook rejected'),
      expect.any(Error),
      expect.objectContaining({ phase: 'pre', hook: 'audit' }),
    )
  })

  it('sync post-hook rejection continues with the next post-hook', async () => {
    const calls: string[] = []
    const delegate = makeDelegate(async (action) => {
      calls.push(action)
      if (action === 'firstPost') throw new Error('first post fail')
    })
    const log = vi.fn()
    const desc: ActionDescriptor = {
      action: 'dispatch',
      postHooks: [
        { action: 'firstPost', sync: true },
        { action: 'secondPost', sync: true },
      ],
    }
    await dispatchAction(desc, makeDeps(delegate, { log }))
    expect(calls).toEqual(['dispatch', 'firstPost', 'secondPost'])
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Post-hook rejected'),
      expect.any(Error),
      expect.objectContaining({ phase: 'post', hook: 'firstPost' }),
    )
  })

  it('main dispatch rejection skips post-hooks', async () => {
    const calls: string[] = []
    const delegate = makeDelegate(async (action) => {
      calls.push(action)
      if (action === 'dispatch') throw new Error('main fail')
    })
    const desc: ActionDescriptor = {
      action: 'dispatch',
      postHooks: [{ action: 'telemetry', sync: true }],
    }
    await dispatchAction(desc, makeDeps(delegate))
    expect(calls).toEqual(['dispatch'])
  })

  it('validation failure: no hooks fire', async () => {
    const calls: string[] = []
    const delegate = makeDelegate(async (action) => { calls.push(action) })
    const desc: ActionDescriptor = {
      action: 'submit',
      preHooks: [{ action: 'audit', sync: true }],
      postHooks: [{ action: 'telemetry' }],
    }
    await dispatchAction(desc, makeDeps(delegate, { runValidation: () => false }))
    expect(calls).toEqual([])
  })

  it('select action: hooks are SKIPPED (no host dispatch)', async () => {
    const onAction = vi.fn()
    const applySelect = vi.fn()
    const desc: ActionDescriptor = {
      action: 'select',
      bind: '$form.choice',
      value: 'A',
      preHooks: [{ action: 'audit', sync: true }],
      postHooks: [{ action: 'telemetry' }],
    }
    await dispatchAction(desc, makeDeps(makeDelegate(onAction), { applySelect }))
    expect(applySelect).toHaveBeenCalledOnce()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('reset action: hooks RUN normally (reset still reaches host)', async () => {
    const calls: Array<{ action: string; phase: string | undefined }> = []
    const delegate = makeDelegate(async (action, _data, _cmd, ctx) => {
      calls.push({ action, phase: ctx?.phase })
    })
    const applyReset = vi.fn()
    const desc: ActionDescriptor = {
      action: 'reset',
      preHooks: [{ action: 'audit', sync: true }],
      postHooks: [{ action: 'telemetry' }],
    }
    await dispatchAction(desc, makeDeps(delegate, { applyReset }))
    expect(applyReset).toHaveBeenCalledOnce()
    expect(calls.map(c => `${c.phase}/${c.action}`)).toEqual([
      'pre/audit',
      'main/reset',
      'post/telemetry',
    ])
  })

  it('reserved-verb hooks are skipped with a warn log', async () => {
    const calls: string[] = []
    const delegate = makeDelegate(async (action) => { calls.push(action) })
    const log = vi.fn()
    const desc: ActionDescriptor = {
      action: 'dispatch',
      preHooks: [
        { action: 'submit', sync: true }, // reserved → skip
        { action: 'audit', sync: true },
      ],
    }
    await dispatchAction(desc, makeDeps(delegate, { log }))
    expect(calls).toEqual(['audit', 'dispatch'])
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('reserved verb'),
      undefined,
      expect.objectContaining({ phase: 'pre', hook: 'submit' }),
    )
  })

  it('context.parent populated on pre/post, undefined on main', async () => {
    const captured: ActionDispatchContext[] = []
    const delegate = makeDelegate(async (_action, _data, _cmd, ctx) => {
      if (ctx) captured.push(ctx)
    })
    const desc: ActionDescriptor = {
      action: 'dispatch',
      command: 'urn:main',
      preHooks: [{ action: 'audit', sync: true }],
      postHooks: [{ action: 'telemetry', sync: true }],
    }
    await dispatchAction(desc, makeDeps(delegate))
    expect(captured.map(c => c.phase)).toEqual(['pre', 'main', 'post'])
    expect(captured[0].parent).toEqual({ action: 'dispatch', command: 'urn:main' })
    expect(captured[1].parent).toBeUndefined()
    expect(captured[2].parent).toEqual({ action: 'dispatch', command: 'urn:main' })
  })

  it('backward-compat: no hooks → onAction called with 3 arguments (4th omitted)', async () => {
    const onAction = vi.fn(async () => {})
    const delegate = makeDelegate(onAction)
    // No descriptor — plain string action, no hooks possible.
    await dispatchAction('cancel', makeDeps(delegate))
    expect(onAction).toHaveBeenCalledOnce()
    // Assert exactly 3 args were passed (4th undefined ≠ not passed; check arguments.length).
    expect(onAction.mock.calls[0].length).toBe(3)
    expect(onAction.mock.calls[0][0]).toBe('cancel')
  })

  it('hooks-declared main call passes context with phase="main"', async () => {
    const onAction = vi.fn(async () => {})
    const delegate = makeDelegate(onAction)
    const desc: ActionDescriptor = {
      action: 'dispatch',
      preHooks: [{ action: 'audit' }],
    }
    await dispatchAction(desc, makeDeps(delegate))
    // Main call (2nd onAction invocation) should have 4 args.
    const mainCall = onAction.mock.calls.find(c => c[0] === 'dispatch')!
    expect(mainCall.length).toBe(4)
    expect(mainCall[3]).toMatchObject({ phase: 'main', sync: true })
  })

  it('array action: each element runs its own pipeline', async () => {
    const calls: Array<{ action: string; phase: string | undefined }> = []
    const delegate = makeDelegate(async (action, _data, _cmd, ctx) => {
      calls.push({ action, phase: ctx?.phase })
    })
    const desc: ActionDescriptor[] = [
      { action: 'a' },
      { action: 'b', preHooks: [{ action: 'audit', sync: true }] },
    ]
    await dispatchAction(desc, makeDeps(delegate))
    expect(calls.map(c => `${c.phase}/${c.action}`)).toEqual([
      'undefined/a',     // no hooks → no context
      'pre/audit',
      'main/b',
    ])
  })

  it('pipeline NEVER throws — last-ditch crash is logged, not raised', async () => {
    const delegate = makeDelegate(async () => { throw new Error('boom') })
    const log = vi.fn()
    const desc: ActionDescriptor = { action: 'dispatch' }
    await expect(dispatchAction(desc, makeDeps(delegate, { log }))).resolves.toBeUndefined()
    // Main dispatch rejection is logged at error.
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Main dispatch rejected'),
      expect.any(Error),
      expect.objectContaining({ action: 'dispatch' }),
    )
  })
})
