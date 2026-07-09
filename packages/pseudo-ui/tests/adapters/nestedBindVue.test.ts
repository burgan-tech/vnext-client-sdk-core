import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const schema: DataSchema = {
  $id: 'nested-bind',
  type: 'object',
  properties: {
    notifications: {
      type: 'object',
      properties: {
        smsNotifications: { type: 'boolean' },
        emailNotifications: { type: 'boolean' },
      },
    },
  },
}

const view: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'nested-bind',
  view: {
    type: 'Column',
    children: [
      { type: 'Checkbox', bind: 'notifications.smsNotifications' },
      { type: 'Button', label: 'Send', action: 'submit' },
    ],
  },
} as ViewDefinition

function delegateStub(overrides: Partial<PseudoViewDelegate> = {}): PseudoViewDelegate {
  return {
    async requestData() { throw new Error('unexpected') },
    async loadComponent() { throw new Error('unexpected') },
    async onAction() {},
    ...overrides,
  }
}

describe('Vue adapter — dotted bind paths', () => {
  it('reads pre-populated nested value into the input', async () => {
    const wrapper = mount(PseudoView, {
      props: {
        schema, view,
        formData: { notifications: { smsNotifications: true } },
        delegate: delegateStub(),
      },
    })
    await wrapper.vm.$nextTick()
    const checkbox = wrapper.find('input[type="checkbox"]').element as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('writes back into a nested object on submit, not a flat dotted key', async () => {
    const onAction = vi.fn()
    const wrapper = mount(PseudoView, {
      props: {
        schema, view,
        formData: { notifications: { smsNotifications: false } },
        delegate: delegateStub({ onAction }),
      },
    })
    await wrapper.vm.$nextTick()
    // Click submit
    await wrapper.find('button').trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(onAction).toHaveBeenCalledWith(
      'submit',
      expect.objectContaining({
        notifications: expect.objectContaining({ smsNotifications: false }),
      }),
      undefined,
    )
    // Ensure no flat dotted key snuck in
    const payload = onAction.mock.calls[0][1] as Record<string, unknown>
    expect(payload['notifications.smsNotifications']).toBeUndefined()
  })
})
