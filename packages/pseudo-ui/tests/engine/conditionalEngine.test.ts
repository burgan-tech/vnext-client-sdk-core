import { describe, it, expect } from 'vitest'
import { evaluateConditional } from '../../src/engine/conditionalEngine'

describe('conditionalEngine', () => {
  const form = { status: 'active', count: 5, name: 'Test', channel: 'digital' }
  const instance = { type: 'premium' }
  const params = { ref: 'R1' }

  describe('evaluateConditional', () => {
    it('returns visible+enabled when no conditional', () => {
      expect(evaluateConditional(undefined, form, instance, params)).toEqual({
        visible: true,
        enabled: true,
      })
    })

    it('showIf: visible when condition met', () => {
      expect(
        evaluateConditional(
          { showIf: { field: 'status', operator: 'equals', value: 'active' } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: true })
    })

    it('showIf: hidden when condition not met', () => {
      expect(
        evaluateConditional(
          { showIf: { field: 'status', operator: 'equals', value: 'inactive' } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: false, enabled: true })
    })

    it('hideIf: hidden when condition met', () => {
      expect(
        evaluateConditional(
          { hideIf: { field: 'status', operator: 'equals', value: 'active' } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: false, enabled: true })
    })

    it('enableIf: disabled when condition not met', () => {
      expect(
        evaluateConditional(
          { enableIf: { field: 'count', operator: 'greaterThan', value: 10 } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: false })
    })

    it('disableIf: disabled when condition met', () => {
      expect(
        evaluateConditional(
          { disableIf: { field: 'status', operator: 'equals', value: 'inactive' } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: true })
    })
  })

  describe('operators', () => {
    it('equals', () => {
      expect(
        evaluateConditional({ showIf: { field: 'status', operator: 'equals', value: 'active' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('notEquals', () => {
      expect(
        evaluateConditional({ showIf: { field: 'status', operator: 'notEquals', value: 'x' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('in', () => {
      expect(
        evaluateConditional({ showIf: { field: 'channel', operator: 'in', value: ['digital', 'mobile'] } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('notIn', () => {
      expect(
        evaluateConditional({ showIf: { field: 'channel', operator: 'notIn', value: ['retail'] } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('greaterThan, lessThan', () => {
      expect(
        evaluateConditional({ showIf: { field: 'count', operator: 'greaterThan', value: 3 } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
      expect(
        evaluateConditional({ showIf: { field: 'count', operator: 'lessThan', value: 10 } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('contains, startsWith, endsWith', () => {
      expect(
        evaluateConditional({ showIf: { field: 'name', operator: 'contains', value: 'es' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
      expect(
        evaluateConditional({ showIf: { field: 'name', operator: 'startsWith', value: 'Te' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
      expect(
        evaluateConditional({ showIf: { field: 'name', operator: 'endsWith', value: 'st' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })

    it('isEmpty, isNotEmpty', () => {
      expect(
        evaluateConditional({ showIf: { field: 'missing', operator: 'isEmpty' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
      expect(
        evaluateConditional({ showIf: { field: 'name', operator: 'isNotEmpty' } }, form, instance, params)
      ).toEqual({ visible: true, enabled: true })
    })
  })

  describe('allOf, anyOf, not', () => {
    it('allOf: all must be true', () => {
      expect(
        evaluateConditional(
          {
            showIf: {
              allOf: [
                { field: 'status', operator: 'equals', value: 'active' },
                { field: 'count', operator: 'greaterThan', value: 0 },
              ],
            },
          },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: true })

      expect(
        evaluateConditional(
          {
            showIf: {
              allOf: [
                { field: 'status', operator: 'equals', value: 'active' },
                { field: 'count', operator: 'greaterThan', value: 100 },
              ],
            },
          },
          form,
          instance,
          params
        )
      ).toEqual({ visible: false, enabled: true })
    })

    it('anyOf: at least one true', () => {
      expect(
        evaluateConditional(
          {
            showIf: {
              anyOf: [
                { field: 'status', operator: 'equals', value: 'x' },
                { field: 'count', operator: 'greaterThan', value: 0 },
              ],
            },
          },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: true })
    })

    it('not: negates rule', () => {
      expect(
        evaluateConditional(
          { showIf: { not: { field: 'status', operator: 'equals', value: 'inactive' } } },
          form,
          instance,
          params
        )
      ).toEqual({ visible: true, enabled: true })
    })
  })

  describe('merged data (form overrides instance overrides params)', () => {
    it('formData has highest priority in merge', () => {
      const f = { x: 'form' }
      const i = { x: 'instance' }
      const p = { x: 'param' }
      // merged = { ...params, ...instanceData, ...formData } -> form wins
      expect(
        evaluateConditional({ showIf: { field: 'x', operator: 'equals', value: 'form' } }, f, i, p)
      ).toEqual({ visible: true, enabled: true })
    })
  })

  describe('forceVisible option (designer mode)', () => {
    it('forces visible:true even when showIf would hide the field', () => {
      const result = evaluateConditional(
        { showIf: { field: 'status', operator: 'equals', value: 'never-matches' } },
        form,
        instance,
        params,
        { forceVisible: true },
      )
      expect(result.visible).toBe(true)
    })

    it('forces visible:true even when hideIf would hide the field', () => {
      const result = evaluateConditional(
        { hideIf: { field: 'status', operator: 'equals', value: 'active' } },
        form,
        instance,
        params,
        { forceVisible: true },
      )
      expect(result.visible).toBe(true)
    })

    it('does NOT override enabled — disableIf still wins', () => {
      const result = evaluateConditional(
        {
          showIf: { field: 'status', operator: 'equals', value: 'never' },
          disableIf: { field: 'status', operator: 'equals', value: 'active' },
        },
        form,
        instance,
        params,
        { forceVisible: true },
      )
      expect(result.visible).toBe(true)
      expect(result.enabled).toBe(false)
    })

    it('default (no options) preserves original behaviour', () => {
      const result = evaluateConditional(
        { showIf: { field: 'status', operator: 'equals', value: 'never-matches' } },
        form,
        instance,
        params,
      )
      expect(result.visible).toBe(false)
    })

    it('forceVisible:false explicitly is a no-op', () => {
      const result = evaluateConditional(
        { showIf: { field: 'status', operator: 'equals', value: 'never-matches' } },
        form,
        instance,
        params,
        { forceVisible: false },
      )
      expect(result.visible).toBe(false)
    })
  })
})
