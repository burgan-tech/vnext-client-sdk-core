import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { PseudoView } from '../../src/adapters/vue'
import type { DataSchema, ViewDefinition, PseudoViewDelegate } from '../../src/engine/types'

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

describe('Designer mode integration', () => {
  describe('ForEach placeholder rendering', () => {
    const schema: DataSchema = {
      $id: 'designer-foreach',
      type: 'object',
      properties: {
        rows: { type: 'object', 'x-labels': { en: 'Rows' } },
      },
    }

    const viewWithForEach: ViewDefinition = {
      $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
      dataSchema: 'designer-foreach',
      view: {
        type: 'Column',
        children: [
          {
            type: 'ForEach',
            source: '$form.rows',
            as: 'item',
            template: {
              type: 'Text',
              content: 'placeholder-row',
              variant: 'bodyMedium',
            },
          },
        ],
      },
    }

    it('renders NOTHING when ForEach source is empty in live mode (default)', () => {
      const wrapper = mount(PseudoView, {
        props: {
          schema,
          view: viewWithForEach,
          delegate: createDelegate(),
        },
      })
      expect(wrapper.text()).not.toContain('placeholder-row')
    })

    it('renders ONE template instance when ForEach source is empty in designer mode', () => {
      const wrapper = mount(PseudoView, {
        props: {
          schema,
          view: viewWithForEach,
          delegate: createDelegate(),
          designer: true,
        },
      })
      expect(wrapper.text()).toContain('placeholder-row')
    })
  })

  describe('Conditional visibility bypass', () => {
    const schemaWithHidden: DataSchema = {
      $id: 'designer-conditional',
      type: 'object',
      properties: {
        toggle: { type: 'string' },
        secret: {
          type: 'string',
          'x-labels': { tr: 'Gizli Alan', en: 'Hidden field' },
          'x-conditional': {
            showIf: { field: 'toggle', operator: 'equals', value: 'reveal' },
          },
        },
      },
    }

    const view: ViewDefinition = {
      $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
      dataSchema: 'designer-conditional',
      view: {
        type: 'Column',
        children: [
          { type: 'TextField', bind: 'secret' },
        ],
      },
    }

    it('hides field with unmet showIf in live mode', () => {
      const wrapper = mount(PseudoView, {
        props: { schema: schemaWithHidden, view, delegate: createDelegate(), lang: 'en' },
      })
      expect(wrapper.text()).not.toContain('Hidden field')
    })

    it('shows field with unmet showIf in designer mode', () => {
      const wrapper = mount(PseudoView, {
        props: { schema: schemaWithHidden, view, delegate: createDelegate(), lang: 'en', designer: true },
      })
      expect(wrapper.text()).toContain('Hidden field')
    })
  })

  describe('Enabled state preservation', () => {
    const schema: DataSchema = {
      $id: 'designer-disabled',
      type: 'object',
      properties: {
        toggle: { type: 'string' },
        protected: {
          type: 'string',
          'x-labels': { en: 'Protected' },
          'x-conditional': {
            // Always visible, but disabled when toggle === 'lock'
            disableIf: { field: 'toggle', operator: 'equals', value: 'lock' },
          },
        },
      },
    }

    const view: ViewDefinition = {
      $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
      dataSchema: 'designer-disabled',
      view: {
        type: 'Column',
        children: [{ type: 'TextField', bind: 'protected' }],
      },
    }

    it('designer mode keeps disabled state when disableIf triggers', () => {
      const wrapper = mount(PseudoView, {
        props: {
          schema,
          view,
          delegate: createDelegate(),
          lang: 'en',
          designer: true,
          formData: { toggle: 'lock' },
        },
      })
      // Field should be visible (rendered) but its input must be disabled.
      expect(wrapper.text()).toContain('Protected')
      const input = wrapper.find('input')
      expect(input.exists()).toBe(true)
      // PrimeVue / native disabled attribute on the underlying input
      expect(input.attributes('disabled')).toBeDefined()
    })
  })
})
