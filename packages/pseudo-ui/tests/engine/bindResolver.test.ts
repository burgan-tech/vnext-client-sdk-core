import { describe, it, expect } from 'vitest'
import { resolveNestedBind, applyNestedUpdate } from '../../src/engine/bindResolver'
import type { FormContext, DataSchema } from '../../src/engine/types'

function createContext(overrides: Partial<FormContext> = {}): FormContext {
  const schema: DataSchema = { $id: 'test', properties: {} }
  return {
    schema,
    formData: { name: 'Jane', city: '34', nested: { a: 1, b: 2 } },
    instanceData: { id: '123', status: 'active', address: { street: 'Main St', city: 'NYC' } },
    params: {},
    uiState: { expanded: true },
    lovData: {},
    lookupData: {},
    lang: 'tr',
    errors: {},
    ...overrides,
  }
}

describe('bindResolver', () => {
  describe('resolveNestedBind', () => {
    it('returns undefined for empty bind', () => {
      const ctx = createContext()
      expect(resolveNestedBind(undefined, ctx)).toBeUndefined()
    })

    it('resolves string bind $instance to instance data', () => {
      const ctx = createContext()
      const result = resolveNestedBind('$instance', ctx)
      expect(result).toEqual({
        form: {},
        instance: { id: '123', status: 'active', address: { street: 'Main St', city: 'NYC' } },
      })
    })

    it('resolves string bind $form to form data', () => {
      const ctx = createContext()
      const result = resolveNestedBind('$form', ctx)
      expect(result).toEqual({
        form: { name: 'Jane', city: '34', nested: { a: 1, b: 2 } },
        instance: {},
      })
    })

    it('returns undefined for non-$ string bind', () => {
      const ctx = createContext()
      expect(resolveNestedBind('plain', ctx)).toBeUndefined()
    })

    it('resolves map bind with $form, $instance, $ui', () => {
      const ctx = createContext()
      const result = resolveNestedBind(
        {
          id: '$instance.id',
          status: '$instance.status',
          name: '$form.name',
          city: '$form.city',
          expanded: '$ui.expanded',
        },
        ctx
      )
      expect(result).toEqual({
        form: { name: 'Jane', city: '34', expanded: true },
        instance: { id: '123', status: 'active' },
      })
    })

    it('splits form vs instance in map bind', () => {
      const ctx = createContext()
      const result = resolveNestedBind(
        {
          childId: '$instance.id',
          childName: '$form.name',
        },
        ctx
      )
      expect(result).toEqual({
        form: { childName: 'Jane' },
        instance: { childId: '123' },
      })
    })

    it('resolves nested path $instance.address.city', () => {
      const ctx = createContext()
      const result = resolveNestedBind({ city: '$instance.address.city' }, ctx)
      expect(result).toEqual({
        form: {},
        instance: { city: 'NYC' },
      })
    })

    it('resolves nested path $form.nested.a', () => {
      const ctx = createContext()
      const result = resolveNestedBind({ val: '$form.nested.a' }, ctx)
      expect(result).toEqual({
        form: { val: 1 },
        instance: {},
      })
    })
  })

  describe('applyNestedUpdate', () => {
    it('applies string bind to formData', () => {
      const ctx = createContext()
      applyNestedUpdate('$form', { x: 1, y: 2 }, ctx)
      expect(ctx.formData['$form']).toEqual({ x: 1, y: 2 })
    })

    it('applies map bind to formData, instanceData, uiState', () => {
      const ctx = createContext()
      applyNestedUpdate(
        {
          newName: '$form.name',
          newStatus: '$instance.status',
          newExpanded: '$ui.expanded',
        },
        { newName: 'Updated', newStatus: 'inactive', newExpanded: false },
        ctx
      )
      expect(ctx.formData.name).toBe('Updated')
      expect(ctx.instanceData.status).toBe('inactive')
      expect(ctx.uiState.expanded).toBe(false)
    })

    it('applies nested path update', () => {
      const ctx = createContext()
      applyNestedUpdate({ city: '$instance.address.city' }, { city: 'LA' }, ctx)
      expect(ctx.instanceData.address).toEqual({ street: 'Main St', city: 'LA' })
    })

    it('no-op for undefined bind', () => {
      const ctx = createContext()
      const before = { ...ctx.formData }
      applyNestedUpdate(undefined, { x: 1 }, ctx)
      expect(ctx.formData).toEqual(before)
    })
  })
})
