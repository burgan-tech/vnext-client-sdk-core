import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

const NESTED_COUNT = 100

const childSchema: DataSchema = {
  $id: 'stress-child',
  properties: {
    id: { type: 'string', 'x-labels': { tr: 'ID' } },
    label: { type: 'string', 'x-labels': { tr: 'Etiket' } },
  },
}

const childView: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'stress-child',
  view: {
    type: 'Column',
    gap: 'xs',
    children: [
      {
        type: 'Row',
        children: [
          { type: 'Text', content: 'Item:', variant: 'labelMedium' },
          { type: 'Text', content: '$param.id', variant: 'bodyMedium' },
        ],
      },
      { type: 'Text', content: '$param.label', variant: 'bodySmall' },
    ],
  },
}

function createStressView(): ViewDefinition {
  return {
    $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
    dataSchema: 'stress-root',
    view: {
      type: 'Column',
      gap: 'sm',
      children: Array.from({ length: NESTED_COUNT }, (_, i) => ({
        type: 'Component',
        ref: `stress-child`,
        bind: {
          id: '$instance.id',
          label: '$instance.label',
        },
      })),
    },
  }
}

const rootSchema: DataSchema = {
  $id: 'stress-root',
  properties: {},
}

function createStressDelegate(): PseudoViewDelegate & { loadComponentCallCount: number } {
  const loadComponents = new Map<string, { schema: DataSchema; view: ViewDefinition }>()
  const delegate: PseudoViewDelegate & { loadComponentCallCount: number } = {
    loadComponentCallCount: 0,
    async requestData() {
      return { response: { data: [] } }
    },
    async loadComponent(ref) {
      delegate.loadComponentCallCount++
      if (!loadComponents.has(ref)) {
        loadComponents.set(ref, { schema: childSchema, view: childView })
      }
      return loadComponents.get(ref)!
    },
    async onAction() {},
  }
  return delegate
}

describe('Stress: 100 nested components', () => {
  it('renders 100 nested components loaded via delegate.loadComponent', async () => {
    const view = createStressView()
    const delegate = createStressDelegate()

    const instanceData: Record<string, unknown> = {
      id: 'stress-id',
      label: 'Stress Label',
    }

    const start = performance.now()

    const wrapper = mount(PseudoView, {
      props: {
        schema: rootSchema,
        view,
        instanceData,
        lang: 'tr',
        delegate,
      },
    })

    // Wait for all async loadComponent calls to complete
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 50)) // allow first batch
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 100)) // allow remaining
    await wrapper.vm.$nextTick()

    const end = performance.now()
    const durationMs = end - start

    // Verify all 100 children rendered (each shows "Item:" and id)
    const text = wrapper.text()
    const itemCount = (text.match(/Item:/g) || []).length

    expect(itemCount).toBe(NESTED_COUNT)
    expect(delegate.loadComponentCallCount).toBe(NESTED_COUNT)

    // Log benchmark for CI
    // eslint-disable-next-line no-console
    console.log(`[Stress] ${NESTED_COUNT} nested components (${delegate.loadComponentCallCount} loadComponent calls): ${durationMs.toFixed(0)} ms`)

    // Sanity: should complete in reasonable time (e.g. < 10s on CI)
    expect(durationMs).toBeLessThan(15000)
  })
})
