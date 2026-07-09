import { describe, it, expect, vi } from 'vitest'
import {
  loadLovForField,
  isLovFilterAffectedByChanges,
} from '../../src/adapters/vue/useLovLoader'
import type { FormContext, DataSchema, RequestDataFn } from '../../src/engine/types'

function createContext(overrides: Partial<FormContext> = {}): FormContext {
  const schema: DataSchema = {
    $id: 'test',
    properties: {
      city: {
        type: 'string',
        'x-lov': {
          source: 'get-cities',
          valueField: 'response.data.items.code',
          displayField: 'response.data.items.name',
          filter: [{ param: 'region', value: '$param.region', required: true }],
        },
      },
      district: {
        type: 'string',
        'x-lov': {
          source: 'get-districts',
          valueField: 'data.items.id',
          displayField: 'data.items.name',
          filter: [{ param: 'cityCode', value: '$form.city', required: true }],
        },
      },
    },
  }
  return {
    schema,
    formData: { city: '34' },
    instanceData: {},
    params: { region: 'eu' },
    uiState: {},
    lovData: {},
    lookupData: {},
    lang: 'tr',
    errors: {},
    ...overrides,
  }
}

describe('useLovLoader', () => {
  describe('loadLovForField', () => {
    it('loads LOV and updates ctx.lovData', async () => {
      const ctx = createContext()
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: { data: { items: [{ code: '34', name: 'İstanbul' }] } },
      })

      await loadLovForField('city', ctx, requestData)

      expect(requestData).toHaveBeenCalledWith('get-cities', { region: 'eu' })
      expect(ctx.lovData.city).toHaveLength(1)
      expect(ctx.lovData.city[0]).toEqual(
        expect.objectContaining({ value: '34', display: 'İstanbul' })
      )
    })

    it('skips when required filter param is missing', async () => {
      const ctx = createContext({ params: {} })
      const requestData: RequestDataFn = vi.fn()

      await loadLovForField('city', ctx, requestData)

      expect(requestData).not.toHaveBeenCalled()
      expect(ctx.lovData.city).toEqual([])
    })

    it('no-op when field has no x-lov', async () => {
      const ctx = createContext()
      ctx.schema.properties!['other'] = { type: 'string' }
      const requestData: RequestDataFn = vi.fn()

      await loadLovForField('other', ctx, requestData)

      expect(requestData).not.toHaveBeenCalled()
    })
  })

  describe('isLovFilterAffectedByChanges', () => {
    it('returns true when filter references changed param field', () => {
      const filter = [
        { param: 'region', value: '$param.region', required: true },
      ]
      expect(isLovFilterAffectedByChanges(filter, ['region'])).toBe(true)
      expect(isLovFilterAffectedByChanges(filter, ['other'])).toBe(false)
    })

    it('returns true when filter references changed form field', () => {
      const filter = [
        { param: 'cityCode', value: '$form.city', required: true },
      ]
      expect(isLovFilterAffectedByChanges(filter, ['city'])).toBe(true)
    })

    it('returns true when filter references changed instance field', () => {
      const filter = [
        { param: 'id', value: '$instance.id', required: false },
      ]
      expect(isLovFilterAffectedByChanges(filter, ['id'])).toBe(true)
    })

    it('handles nested path - first segment match', () => {
      const filter = [
        { param: 'x', value: '$param.address.city', required: false },
      ]
      expect(isLovFilterAffectedByChanges(filter, ['address'])).toBe(true)
      expect(isLovFilterAffectedByChanges(filter, ['city'])).toBe(false)
    })

    it('returns false for empty filter or changedFields', () => {
      expect(isLovFilterAffectedByChanges(undefined, ['x'])).toBe(false)
      expect(isLovFilterAffectedByChanges([], ['x'])).toBe(false)
      expect(
        isLovFilterAffectedByChanges([{ param: 'a', value: '$param.x', required: false }], [])
      ).toBe(false)
    })
  })
})
