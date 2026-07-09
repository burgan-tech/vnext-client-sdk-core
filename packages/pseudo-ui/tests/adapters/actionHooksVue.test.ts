import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const schema: DataSchema = {
  $id: 'hooks-test-vue',
  type: 'object',
  properties: {},
}

function viewWithHookedButton(action: unknown): ViewDefinition {
  return {
    $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
    dataSchema: 'hooks-test-vue',
    view: {
      type: 'Column',
      children: [{ type: 'Button', label: 'Go', action: action as never }],
    },
  } as ViewDefinition
}

function delegateStub(onAction: PseudoViewDelegate['onAction']): PseudoViewDelegate {
  return {
    async requestData() { throw new Error('unexpected') },
    async loadComponent() { throw new Error('unexpected') },
    onAction,
  }
}

async function flushMicrotasks() {
  await new Promise(r => setTimeout(r, 0))
}

describe('Action hooks — Vue adapter end-to-end', () => {
  it('fires pre → main → post on Button click', async () => {
    const calls: Array<{ action: string; phase: string | undefined }> = []
    const onAction = vi.fn(async (action: string, _data, _cmd, ctx) => {
      calls.push({ action, phase: ctx?.phase })
    })
    const wrapper = mount(PseudoView, {
      props: {
        schema,
        view: viewWithHookedButton({
          action: 'dispatch',
          command: 'urn:main',
          preHooks: [{ action: 'audit', sync: true }],
          postHooks: [{ action: 'telemetry', sync: true }],
        }),
        delegate: delegateStub(onAction),
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    expect(calls.map(c => `${c.phase}/${c.action}`)).toEqual([
      'pre/audit',
      'main/dispatch',
      'post/telemetry',
    ])
  })

  it('sync pre-hook rejection blocks the main dispatch', async () => {
    const onAction = vi.fn(async (action: string) => {
      if (action === 'audit') throw new Error('refused')
    })
    const wrapper = mount(PseudoView, {
      props: {
        schema,
        view: viewWithHookedButton({
          action: 'dispatch',
          preHooks: [{ action: 'audit', sync: true }],
          postHooks: [{ action: 'telemetry' }],
        }),
        delegate: delegateStub(onAction),
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    expect(onAction.mock.calls.map(c => c[0])).toEqual(['audit'])
  })

  it('backward-compat: no hooks → onAction called with 3 args', async () => {
    const onAction = vi.fn(async () => {})
    const wrapper = mount(PseudoView, {
      props: {
        schema,
        view: viewWithHookedButton({ action: 'cancel' }),
        delegate: delegateStub(onAction),
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction.mock.calls[0].length).toBe(3)
    expect(onAction.mock.calls[0][0]).toBe('cancel')
  })
})
