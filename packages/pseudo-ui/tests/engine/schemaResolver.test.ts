import { describe, it, expect } from 'vitest'
import {
  getSchemaProperty,
  getFieldLabel,
  getFieldErrorMessage,
  isFieldRequired,
  getEnumOptions,
  mapLovItemsToOptions,
  validateField,
  enumerateBindPaths,
} from '../../src/engine/schemaResolver'
import type { DataSchema, SchemaProperty } from '../../src/engine/types'

const sampleSchema: DataSchema = {
  $id: 'test',
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      'x-labels': { tr: 'Ad', en: 'Name' },
      'x-errorMessages': {
        required: { tr: 'Ad zorunludur', en: 'Name is required' },
        minLength: { tr: 'En az 2 karakter', en: 'Min 2 chars' },
      },
    },
    email: {
      type: 'string',
      format: 'email',
      'x-labels': { tr: 'E-posta', en: 'Email' },
    },
    age: {
      type: 'integer',
      minimum: 0,
      maximum: 120,
      'x-labels': { tr: 'Yaş', en: 'Age' },
    },
    status: {
      type: 'string',
      enum: ['active', 'inactive'],
      'x-enum': { active: { tr: 'Aktif', en: 'Active' }, inactive: { tr: 'Pasif', en: 'Inactive' } },
    },
    code: {
      type: 'string',
      pattern: '^[A-Z]{2}\\d{4}$',
      'x-labels': { tr: 'Kod', en: 'Code' },
    },
    fixed: {
      type: 'string',
      const: 'FIXED_VALUE',
    },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'active' } }, required: ['status'] },
      then: { required: ['code'] },
    },
  ],
}

describe('schemaResolver', () => {
  describe('getSchemaProperty', () => {
    it('returns property by name', () => {
      expect(getSchemaProperty(sampleSchema, 'name')).toEqual(sampleSchema.properties!.name)
      expect(getSchemaProperty(sampleSchema, 'email')).toEqual(sampleSchema.properties!.email)
    })

    it('returns undefined for missing', () => {
      expect(getSchemaProperty(sampleSchema, 'missing')).toBeUndefined()
    })
  })

  describe('getFieldLabel', () => {
    it('returns localized label', () => {
      expect(getFieldLabel(sampleSchema.properties!.name, 'tr')).toBe('Ad')
      expect(getFieldLabel(sampleSchema.properties!.name, 'en')).toBe('Name')
    })

    it('returns empty for undefined prop or no x-labels', () => {
      expect(getFieldLabel(undefined, 'tr')).toBe('')
    })
  })

  describe('getFieldErrorMessage', () => {
    it('returns localized error message', () => {
      expect(getFieldErrorMessage(sampleSchema.properties!.name, 'required', 'tr')).toBe('Ad zorunludur')
      expect(getFieldErrorMessage(sampleSchema.properties!.name, 'minLength', 'en')).toBe('Min 2 chars')
    })

    it('returns empty for missing error type', () => {
      expect(getFieldErrorMessage(sampleSchema.properties!.name, 'maxLength', 'tr')).toBe('')
    })
  })

  describe('isFieldRequired', () => {
    it('returns true for schema.required', () => {
      expect(isFieldRequired(sampleSchema, 'name', {}, {}, {})).toBe(true)
    })

    it('returns false when not in required', () => {
      expect(isFieldRequired(sampleSchema, 'email', {}, {}, {})).toBe(false)
    })

    it('returns true for allOf conditional required (status=active -> code required)', () => {
      const form = { status: 'active' }
      expect(isFieldRequired(sampleSchema, 'code', form, {}, {})).toBe(true)
    })

    it('returns false when allOf condition not met', () => {
      const form = { status: 'inactive' }
      expect(isFieldRequired(sampleSchema, 'code', form, {}, {})).toBe(false)
    })
  })

  describe('getEnumOptions', () => {
    it('returns value+label pairs', () => {
      const opts = getEnumOptions(sampleSchema.properties!.status, 'tr')
      expect(opts).toEqual([
        { value: 'active', label: 'Aktif' },
        { value: 'inactive', label: 'Pasif' },
      ])
    })

    it('returns raw value when no x-enum', () => {
      const schemaWithEnumOnly: DataSchema = {
        properties: { x: { type: 'string', enum: ['a', 'b'] } },
      }
      const opts = getEnumOptions(schemaWithEnumOnly.properties!.x, 'tr')
      expect(opts).toEqual([
        { value: 'a', label: 'a' },
        { value: 'b', label: 'b' },
      ])
    })

    it('returns empty for no enum', () => {
      expect(getEnumOptions(sampleSchema.properties!.name, 'tr')).toEqual([])
    })
  })

  describe('mapLovItemsToOptions', () => {
    it('maps LovItem to value/label', () => {
      const items = [
        { value: '34', display: 'İstanbul', code: '34' },
        { value: '06', display: 'Ankara', code: '06' },
      ]
      expect(mapLovItemsToOptions(items)).toEqual([
        { value: '34', label: 'İstanbul' },
        { value: '06', label: 'Ankara' },
      ])
    })
  })

  describe('validateField', () => {
    it('required: error when empty', () => {
      expect(validateField(sampleSchema.properties!.name, '', true, 'tr')).toBe('Ad zorunludur')
      expect(validateField(sampleSchema.properties!.name, undefined, true, 'tr')).toBe('Ad zorunludur')
      expect(validateField(sampleSchema.properties!.name, null, true, 'tr')).toBe('Ad zorunludur')
    })

    it('required: null when has value', () => {
      expect(validateField(sampleSchema.properties!.name, 'Jane', true, 'tr')).toBeNull()
    })

    it('optional: null when empty', () => {
      expect(validateField(sampleSchema.properties!.email, '', false, 'tr')).toBeNull()
    })

    it('minLength', () => {
      expect(validateField(sampleSchema.properties!.name, 'A', true, 'tr')).toBe('En az 2 karakter')
      expect(validateField(sampleSchema.properties!.name, 'AB', true, 'tr')).toBeNull()
    })

    it('maxLength', () => {
      const long = 'a'.repeat(51)
      expect(validateField(sampleSchema.properties!.name, long, true, 'tr')).toContain('Maximum')
    })

    it('pattern', () => {
      expect(validateField(sampleSchema.properties!.code, 'AB1234', false, 'tr')).toBeNull()
      expect(validateField(sampleSchema.properties!.code, 'invalid', false, 'tr')).toContain('Invalid')
    })

    it('minimum, maximum (number)', () => {
      expect(validateField(sampleSchema.properties!.age, -1, false, 'tr')).toContain('Minimum')
      expect(validateField(sampleSchema.properties!.age, 150, false, 'tr')).toContain('Maximum')
      expect(validateField(sampleSchema.properties!.age, 25, false, 'tr')).toBeNull()
    })

    it('const', () => {
      expect(validateField(sampleSchema.properties!.fixed, 'OTHER', false, 'tr')).toContain('Invalid')
      expect(validateField(sampleSchema.properties!.fixed, 'FIXED_VALUE', false, 'tr')).toBeNull()
    })

    it('format: email', () => {
      expect(validateField(sampleSchema.properties!.email, 'a@b.com', false, 'tr')).toBeNull()
      expect(validateField(sampleSchema.properties!.email, 'invalid', false, 'tr')).toBe('Invalid email')
    })

    it('format: date', () => {
      const dateProp: SchemaProperty = { type: 'string', format: 'date' }
      expect(validateField(dateProp, '2024-01-15', false, 'tr')).toBeNull()
      expect(validateField(dateProp, 'not-a-date', false, 'tr')).toBe('Invalid date')
    })
  })

  describe('getSchemaProperty defensive guards', () => {
    it('returns undefined for non-string fieldName (e.g. Record bind)', () => {
      // NestedComponentNode.bind can be Record<string, string>; callers may forward it
      // before narrowing. Should not crash.
      expect(getSchemaProperty(sampleSchema, {} as unknown as string)).toBeUndefined()
      expect(getSchemaProperty(sampleSchema, null as unknown as string)).toBeUndefined()
      expect(getSchemaProperty(sampleSchema, undefined as unknown as string)).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      expect(getSchemaProperty(sampleSchema, '')).toBeUndefined()
    })
  })

  describe('enumerateBindPaths', () => {
    const nestedSchema: DataSchema = {
      required: ['firstName'],
      properties: {
        firstName: {
          type: 'string',
          'x-labels': { tr: 'Ad', en: 'First name' },
        },
        email: {
          type: 'string',
          format: 'email',
        },
        city: {
          type: 'string',
          'x-lov': { source: 'urn:lov:cities', valueField: 'code', displayField: 'name' },
        },
        branchDetail: {
          type: 'object',
          'x-lookup': { source: 'urn:lookup:branch', resultField: '$.response.data' },
          properties: {
            address: { type: 'string' },
            phone: { type: 'string', format: 'phone' },
          },
        },
      },
    }

    it('lists every top-level field', () => {
      const paths = enumerateBindPaths(nestedSchema).map(e => e.path)
      expect(paths).toContain('firstName')
      expect(paths).toContain('email')
      expect(paths).toContain('city')
    })

    it('recurses into nested object properties with dotted paths', () => {
      const paths = enumerateBindPaths(nestedSchema).map(e => e.path)
      expect(paths).toContain('branchDetail.address')
      expect(paths).toContain('branchDetail.phone')
    })

    it('flags required top-level fields', () => {
      const firstName = enumerateBindPaths(nestedSchema).find(e => e.path === 'firstName')
      const email = enumerateBindPaths(nestedSchema).find(e => e.path === 'email')
      expect(firstName?.required).toBe(true)
      expect(email?.required).toBe(false)
    })

    it('detects hasLov and hasLookup', () => {
      const entries = enumerateBindPaths(nestedSchema)
      const city = entries.find(e => e.path === 'city')
      const branchDetail = entries.find(e => e.path === 'branchDetail')
      expect(city?.hasLov).toBe(true)
      expect(city?.hasLookup).toBe(false)
      expect(branchDetail?.hasLookup).toBe(true)
    })

    it('reports depth correctly', () => {
      const entries = enumerateBindPaths(nestedSchema)
      expect(entries.find(e => e.path === 'firstName')?.depth).toBe(0)
      expect(entries.find(e => e.path === 'branchDetail.address')?.depth).toBe(1)
    })

    it('omits object parents when includeObjects is false', () => {
      const paths = enumerateBindPaths(nestedSchema, { includeObjects: false }).map(e => e.path)
      expect(paths).not.toContain('branchDetail')
      expect(paths).toContain('branchDetail.address')
    })

    it('respects maxDepth', () => {
      const paths = enumerateBindPaths(nestedSchema, { maxDepth: 0 }).map(e => e.path)
      expect(paths).toContain('firstName')
      expect(paths).toContain('branchDetail')
      expect(paths).not.toContain('branchDetail.address')
    })

    it('prepends prefix when provided', () => {
      const paths = enumerateBindPaths(nestedSchema, { prefix: '$form' }).map(e => e.path)
      expect(paths).toContain('$form.firstName')
      expect(paths).toContain('$form.branchDetail.address')
    })

    it('returns empty array for schema without properties', () => {
      expect(enumerateBindPaths({})).toEqual([])
    })

    it('carries type, format and label metadata', () => {
      const email = enumerateBindPaths(nestedSchema).find(e => e.path === 'email')
      const firstName = enumerateBindPaths(nestedSchema).find(e => e.path === 'firstName')
      expect(email?.type).toBe('string')
      expect(email?.format).toBe('email')
      expect(firstName?.label).toEqual({ tr: 'Ad', en: 'First name' })
    })
  })
})
