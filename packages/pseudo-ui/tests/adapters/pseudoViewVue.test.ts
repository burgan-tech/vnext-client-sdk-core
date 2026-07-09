import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const schema: DataSchema = {
  $id: 'vue-render-root-test',
  type: 'object',
  properties: { title: { type: 'string', 'x-labels': { tr: 'Başlık' } } },
}

const view: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'vue-render-root-test',
  view: {
    type: 'Column',
    children: [{ type: 'Text', content: 'Hello', variant: 'bodyMedium' }],
  },
}

function delegate(): PseudoViewDelegate {
  return {
    async requestData() { throw new Error('unexpected') },
    async loadComponent() { throw new Error('unexpected') },
    async onAction() {},
  }
}

function makeShadow(): { shadow: ShadowRoot; mountPoint: HTMLElement } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  return { shadow, mountPoint }
}

describe('PseudoView (Vue) renderRoot prop', () => {
  it('renders into light DOM with no renderRoot (regression)', async () => {
    const wrapper = mount(PseudoView, {
      props: { schema, view, lang: 'tr', delegate: delegate() },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Hello')
  })

  it('adopts SDK styles into the given ShadowRoot', async () => {
    const { shadow, mountPoint } = makeShadow()
    const wrapper = mount(PseudoView, {
      attachTo: mountPoint,
      props: { schema, view, lang: 'tr', delegate: delegate(), renderRoot: shadow },
    })
    await wrapper.vm.$nextTick()
    expect(shadow.adoptedStyleSheets.length).toBeGreaterThan(0)
  })
})
