import { describe, it, expect } from 'vitest'
import {
  resolveExpression,
  resolveTextContent,
  resolveMultiLang,
  resolveFilterParams,
  extractDynamicFilterFields,
  areRequiredFiltersMet,
  navigatePath,
} from '../../src/engine/expressionResolver'
import type { FormContext, DataSchema } from '../../src/engine/types'

function createContext(overrides: Partial<FormContext> = {}): FormContext {
  const schema: DataSchema = {
    $id: 'test',
    properties: {
      name: { type: 'string', 'x-labels': { tr: 'Ad', en: 'Name' } },
      city: { type: 'string', 'x-labels': { tr: 'Şehir', en: 'City' } },
      status: {
        type: 'string',
        enum: ['active', 'inactive'],
        'x-enum': { active: { tr: 'Aktif', en: 'Active' }, inactive: { tr: 'Pasif', en: 'Inactive' } },
      },
    },
  }
  return {
    schema,
    formData: { name: 'Jane', city: '34' },
    instanceData: { id: '123', status: 'active' },
    params: {},
    uiState: {},
    lovData: {
      city: [
        { value: '34', display: 'İstanbul', code: '34' },
        { value: '06', display: 'Ankara', code: '06' },
      ],
    },
    lookupData: {
      branchDetail: { address: 'Main St 1', phone: '+90 212 123 4567', manager: 'John' },
    },
    lang: 'tr',
    errors: {},
    ...overrides,
  }
}

describe('expressionResolver', () => {
  describe('resolveExpression', () => {
    it('returns expr as-is when not starting with $', () => {
      const ctx = createContext()
      expect(resolveExpression('plain text', ctx)).toBe('plain text')
      expect(resolveExpression('', ctx)).toBe('')
    })

    it('resolves $form.field', () => {
      const ctx = createContext()
      expect(resolveExpression('$form.name', ctx)).toBe('Jane')
      expect(resolveExpression('$form.city', ctx)).toBe('34')
      expect(resolveExpression('$form.missing', ctx)).toBeUndefined()
    })

    it('resolves $instance.field', () => {
      const ctx = createContext()
      expect(resolveExpression('$instance.id', ctx)).toBe('123')
      expect(resolveExpression('$instance.status', ctx)).toBe('active')
    })

    it('resolves $param.field', () => {
      const ctx = createContext({ params: { selectedId: 'x-99' } })
      expect(resolveExpression('$param.selectedId', ctx)).toBe('x-99')
    })

    it('resolves $schema.field.label', () => {
      const ctx = createContext()
      expect(resolveExpression('$schema.name.label', ctx)).toEqual({ tr: 'Ad', en: 'Name' })
      expect(resolveExpression('$schema.city.label', ctx)).toEqual({ tr: 'Şehir', en: 'City' })
    })

    it('resolves $lov.field (items array)', () => {
      const ctx = createContext()
      const items = resolveExpression('$lov.city', ctx) as Array<{ value: string; display: string }>
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual(expect.objectContaining({ value: '34', display: 'İstanbul' }))
    })

    it('resolves $lov.field.display (current value label)', () => {
      const ctx = createContext()
      expect(resolveExpression('$lov.city.display', ctx)).toBe('İstanbul')
    })

    it('resolves $lookup.prop.field', () => {
      const ctx = createContext()
      expect(resolveExpression('$lookup.branchDetail.address', ctx)).toBe('Main St 1')
      expect(resolveExpression('$lookup.branchDetail.phone', ctx)).toBe('+90 212 123 4567')
      expect(resolveExpression('$lookup.branchDetail', ctx)).toEqual(
        expect.objectContaining({ address: 'Main St 1', phone: '+90 212 123 4567' })
      )
    })

    it('resolves $ui.field', () => {
      const ctx = createContext({ uiState: { expanded: true } })
      expect(resolveExpression('$ui.expanded', ctx)).toBe(true)
    })

    it('resolves $item.field in ForEach context', () => {
      const ctx = createContext()
      const item = { id: 1, title: 'First' }
      expect(resolveExpression('$item.title', ctx, item)).toBe('First')
      expect(resolveExpression('$item.id', ctx, item)).toBe(1)
    })

    it('resolves $context.lang', () => {
      const ctx = createContext()
      expect(resolveExpression('$context.lang', ctx)).toBe('tr')
    })

    it('returns expr for unknown $ prefix', () => {
      const ctx = createContext()
      expect(resolveExpression('$unknown.xyz', ctx)).toBe('$unknown.xyz')
    })
  })

  describe('resolveMultiLang', () => {
    it('returns lang match', () => {
      expect(resolveMultiLang({ tr: 'Ad', en: 'Name' }, 'tr')).toBe('Ad')
      expect(resolveMultiLang({ tr: 'Ad', en: 'Name' }, 'en')).toBe('Name')
    })

    it('falls back to en, tr, first value', () => {
      expect(resolveMultiLang({ tr: 'Ad', en: 'Name' }, 'de')).toBe('Name')
      expect(resolveMultiLang({ tr: 'Ad' }, 'en')).toBe('Ad')
      expect(resolveMultiLang({ x: 'Fallback' }, 'tr')).toBe('Fallback')
    })

    it('returns empty for undefined', () => {
      expect(resolveMultiLang(undefined, 'tr')).toBe('')
    })
  })

  describe('resolveTextContent', () => {
    it('returns plain string as-is', () => {
      const ctx = createContext()
      expect(resolveTextContent('Hello', ctx)).toBe('Hello')
    })

    it('resolves $ expression to string', () => {
      const ctx = createContext()
      expect(resolveTextContent('$form.name', ctx)).toBe('Jane')
    })

    it('resolves MultiLangText with lang', () => {
      const ctx = createContext()
      expect(resolveTextContent({ tr: 'Merhaba', en: 'Hello' }, ctx)).toBe('Merhaba')
    })

    it('resolves $schema.label to localized string', () => {
      const ctx = createContext()
      expect(resolveTextContent('$schema.name.label', ctx)).toBe('Ad')
    })

    it('resolves $lov.display for enum-like', () => {
      const ctx = createContext()
      expect(resolveTextContent('$lov.city.display', ctx)).toBe('İstanbul')
    })
  })

  describe('resolveFilterParams', () => {
    it('resolves $form, $instance, $param to query params', () => {
      const form = { city: '34' }
      const instance = {}
      const params = { branchCode: 'BR-001' }
      const filter = [
        { param: 'cityCode', value: '$form.city', required: false },
        { param: 'branchCode', value: '$param.branchCode', required: true },
      ]
      expect(resolveFilterParams(filter, form, instance, params)).toEqual({
        cityCode: '34',
        branchCode: 'BR-001',
      })
    })

    it('returns literal value when not $ expression', () => {
      const filter = [{ param: 'channel', value: 'digital', required: false }]
      expect(resolveFilterParams(filter, {}, {}, {})).toEqual({ channel: 'digital' })
    })

    it('returns null when required filter param is missing', () => {
      const filter = [{ param: 'branchCode', value: '$param.branchCode', required: true }]
      expect(resolveFilterParams(filter, {}, {}, {})).toBeNull()
    })

    it('omits optional param when value is empty', () => {
      const filter = [
        { param: 'cityCode', value: '$form.city', required: false },
        { param: 'branchCode', value: '$param.branchCode', required: true },
      ]
      expect(resolveFilterParams(filter, { city: '' }, {}, { branchCode: 'BR-001' })).toEqual({
        branchCode: 'BR-001',
      })
    })
  })

  describe('extractDynamicFilterFields', () => {
    it('extracts form, instance, param field paths', () => {
      const filter = [
        { param: 'a', value: '$form.city', required: false },
        { param: 'b', value: '$instance.id', required: false },
        { param: 'c', value: '$param.ref', required: false },
      ]
      expect(extractDynamicFilterFields(filter)).toEqual({
        formFields: ['city'],
        instanceFields: ['id'],
        paramFields: ['ref'],
      })
    })
  })

  describe('areRequiredFiltersMet', () => {
    it('returns true when all required params have values', () => {
      const filter = [
        { param: 'x', value: '$form.city', required: true },
        { param: 'y', value: '$param.ref', required: true },
      ]
      expect(areRequiredFiltersMet(filter, { city: '34' }, {}, { ref: 'R1' })).toBe(true)
    })

    it('returns false when required param is missing', () => {
      const filter = [{ param: 'x', value: '$form.city', required: true }]
      expect(areRequiredFiltersMet(filter, { city: '' }, {}, {})).toBe(false)
      expect(areRequiredFiltersMet(filter, {}, {}, {})).toBe(false)
    })
  })

  describe('navigatePath', () => {
    it('navigates nested path', () => {
      const obj = { a: { b: { c: 42 } } }
      expect(navigatePath(obj, ['a', 'b', 'c'])).toBe(42)
    })

    it('returns undefined for missing key', () => {
      expect(navigatePath({ a: 1 }, ['b'])).toBeUndefined()
      expect(navigatePath({ a: { b: 1 } }, ['a', 'c'])).toBeUndefined()
    })

    it('returns undefined for null/undefined object', () => {
      expect(navigatePath(null, ['a'])).toBeUndefined()
      expect(navigatePath(undefined, ['a'])).toBeUndefined()
    })
  })
})
