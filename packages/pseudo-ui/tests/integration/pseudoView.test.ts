import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const minimalSchema: DataSchema = {
  $id: 'test',
  type: 'object',
  properties: {
    title: { type: 'string', 'x-labels': { tr: 'Başlık', en: 'Title' } },
  },
}

const layoutOnlyView: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'test',
  view: {
    type: 'Column',
    gap: 'sm',
    children: [
      {
        type: 'Row',
        children: [
          { type: 'Text', content: 'Hello', variant: 'titleLarge' },
        ],
      },
      {
        type: 'Text',
        content: '$schema.title.label',
        variant: 'bodyMedium',
      },
    ],
  },
}

function createDelegate(): PseudoViewDelegate {
  return {
    async requestData() {
      throw new Error('Unexpected requestData')
    },
    async loadComponent() {
      throw new Error('Unexpected loadComponent')
    },
    async onAction() {},
  }
}

describe('PseudoView integration', () => {
  it('renders layout (Column, Row, Text)', async () => {
    const wrapper = mount(PseudoView, {
      props: {
        schema: minimalSchema,
        view: layoutOnlyView,
        lang: 'tr',
        delegate: createDelegate(),
      },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Hello')
    expect(wrapper.text()).toContain('Başlık')
  })

  it('renders Text with $form expression', async () => {
    const view: ViewDefinition = {
      ...layoutOnlyView,
      view: {
        type: 'Column',
        children: [
          { type: 'Text', content: '$form.name', variant: 'bodyMedium' },
        ],
      },
    }

    const wrapper = mount(PseudoView, {
      props: {
        schema: { ...minimalSchema, properties: { name: { type: 'string' } } },
        view,
        formData: { name: 'Jane Doe' },
        lang: 'tr',
        delegate: createDelegate(),
      },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Jane Doe')
  })

  it('renders Text with $instance expression', async () => {
    const view: ViewDefinition = {
      ...layoutOnlyView,
      view: {
        type: 'Column',
        children: [
          { type: 'Text', content: '$instance.status', variant: 'bodyMedium' },
        ],
      },
    }

    const wrapper = mount(PseudoView, {
      props: {
        schema: minimalSchema,
        view,
        instanceData: { status: 'active' },
        lang: 'tr',
        delegate: createDelegate(),
      },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('active')
  })

  it('renders nested Component via loadComponent', async () => {
    const childSchema: DataSchema = {
      $id: 'child',
      properties: { value: { type: 'string', 'x-labels': { tr: 'Değer' } } },
    }
    const childView: ViewDefinition = {
      $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
      dataSchema: 'child',
      view: {
        type: 'Column',
        children: [
          { type: 'Text', content: 'Nested content', variant: 'bodyMedium' },
        ],
      },
    }

    const parentView: ViewDefinition = {
      ...layoutOnlyView,
      view: {
        type: 'Column',
        children: [
          {
            type: 'Component',
            ref: 'child-widget',
            bind: { value: '$form.childValue' },
          },
        ],
      },
    }

    const delegate: PseudoViewDelegate = {
      ...createDelegate(),
      async loadComponent(ref) {
        if (ref === 'child-widget') {
          return { schema: childSchema, view: childView }
        }
        throw new Error(`Unknown: ${ref}`)
      },
    }

    const wrapper = mount(PseudoView, {
      props: {
        schema: { ...minimalSchema, properties: { childValue: { type: 'string' } } },
        view: parentView,
        formData: { childValue: 'x' },
        lang: 'tr',
        delegate,
      },
    })

    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 50)) // allow async loadComponent

    expect(wrapper.text()).toContain('Nested content')
  })
})
