import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const schema: DataSchema = {
  $id: 'designer-test-vue',
  type: 'object',
  properties: {},
}

const view: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'designer-test-vue',
  view: {
    type: 'Column',
    children: [
      { type: 'Text', content: 'A' },
      { type: 'Text', content: 'B' },
    ],
  },
} as ViewDefinition

function baseDelegate(): PseudoViewDelegate {
  return {
    async requestData() { throw new Error('unexpected') },
    async loadComponent() { throw new Error('unexpected') },
    async onAction() {},
  }
}

describe('PseudoView (Vue) designer mode', () => {
  it('renders without designer wrapper when designer is off', async () => {
    const wrapper = mount(PseudoView, { props: { schema, view, delegate: baseDelegate() } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-pseudo-path]').exists()).toBe(false)
    expect(wrapper.text()).toContain('A')
  })

  it('wraps every node with data-pseudo-path when designer is on', async () => {
    const wrapper = mount(PseudoView, { props: { schema, view, delegate: baseDelegate(), designer: true } })
    await wrapper.vm.$nextTick()
    const wrappers = wrapper.findAll('[data-pseudo-path]')
    expect(wrappers.length).toBeGreaterThanOrEqual(3)
    const paths = wrappers.map(el => el.attributes('data-pseudo-path'))
    expect(paths).toContain('/view')
    expect(paths).toContain('/view/children/0')
    expect(paths).toContain('/view/children/1')
  })

  it('fires delegate.onNodeSelect with the correct path on click', async () => {
    const onNodeSelect = vi.fn()
    const delegate: PseudoViewDelegate = { ...baseDelegate(), onNodeSelect }
    const wrapper = mount(PseudoView, { props: { schema, view, delegate, designer: true } })
    await wrapper.vm.$nextTick()
    const target = wrapper.find('[data-pseudo-path="/view/children/1"]')
    expect(target.exists()).toBe(true)
    await target.trigger('click')
    expect(onNodeSelect).toHaveBeenCalledTimes(1)
    expect(onNodeSelect.mock.calls[0][0]).toBe('/view/children/1')
    expect((onNodeSelect.mock.calls[0][1] as { content: string }).content).toBe('B')
  })

  it('applies selected class when selectedNodePath matches', async () => {
    const wrapper = mount(PseudoView, {
      props: { schema, view, delegate: baseDelegate(), designer: true, selectedNodePath: '/view/children/0' },
    })
    await wrapper.vm.$nextTick()
    const target = wrapper.find('[data-pseudo-path="/view/children/0"]')
    expect(target.classes()).toContain('pseudo-designer-node--selected')
  })

  it('clicking the delete button fires delegate.onNodeDelete', async () => {
    const onNodeDelete = vi.fn()
    const delegate: PseudoViewDelegate = { ...baseDelegate(), onNodeDelete }
    const wrapper = mount(PseudoView, {
      props: { schema, view, delegate, designer: true, selectedNodePath: '/view/children/0' },
    })
    await wrapper.vm.$nextTick()
    const btn = wrapper.find('.pseudo-designer-delete-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(onNodeDelete).toHaveBeenCalledWith('/view/children/0')
  })

  it('"preview" mode emits no canvas chrome but keeps designerMode bypass active', async () => {
    const wrapper = mount(PseudoView, { props: { schema, view, delegate: baseDelegate(), designer: 'preview' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-pseudo-path]').exists()).toBe(false)
    expect(wrapper.find('.pseudo-designer-node').exists()).toBe(false)
    expect(wrapper.text()).toContain('A')
  })

  it('applies host-provided classNames to node, selected and delete button', async () => {
    const wrapper = mount(PseudoView, {
      props: {
        schema, view, delegate: baseDelegate(), designer: true,
        selectedNodePath: '/view/children/0',
        designerClassNames: { node: 'my-node', selected: 'my-selected', deleteButton: 'my-delete' },
      },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pseudo-designer-node').exists()).toBe(false)
    expect(wrapper.findAll('.my-node').length).toBeGreaterThan(0)
    expect(wrapper.find('.my-selected').exists()).toBe(true)
    expect(wrapper.find('.my-delete').exists()).toBe(true)
  })
})
