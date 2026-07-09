import { describe, it, expect, vi } from 'vitest'
import { fetchLovData, fetchLookupData } from '../../src/engine/dataClient'
import type { LovDefinition, LookupDefinition, RequestDataFn } from '../../src/engine/types'

describe('dataClient', () => {
  const noopLog = () => {}

  describe('fetchLovData', () => {
    const lov: LovDefinition = {
      source: 'get-cities',
      valueField: 'response.data.items.code',
      displayField: 'response.data.items.name',
    }

    it('extracts LOV items from response path', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: {
          data: {
            items: [
              { code: '34', name: 'İstanbul' },
              { code: '06', name: 'Ankara' },
            ],
          },
        },
      })

      const items = await fetchLovData(requestData, lov, undefined, noopLog)

      expect(requestData).toHaveBeenCalledWith('get-cities', undefined)
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual(expect.objectContaining({ value: '34', display: 'İstanbul' }))
      expect(items[1]).toEqual(expect.objectContaining({ value: '06', display: 'Ankara' }))
    })

    it('passes query params to requestData', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({ response: { data: { items: [] } } })

      await fetchLovData(requestData, lov, { cityCode: '34' }, noopLog)

      expect(requestData).toHaveBeenCalledWith('get-cities', { cityCode: '34' })
    })

    it('returns empty array when path is not array', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: { data: { items: 'not-array' } },
      })

      const items = await fetchLovData(requestData, lov, undefined, noopLog)

      expect(items).toEqual([])
    })

    it('returns empty array on error', async () => {
      const requestData: RequestDataFn = vi.fn().mockRejectedValue(new Error('Network error'))

      const items = await fetchLovData(requestData, lov, undefined, noopLog)

      expect(items).toEqual([])
    })

    it('handles valueField/displayField with different leaf keys', async () => {
      const lov2: LovDefinition = {
        source: 'get-x',
        valueField: 'data.list.id',
        displayField: 'data.list.label',
      }
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        data: {
          list: [
            { id: '1', label: 'One' },
            { id: '2', label: 'Two' },
          ],
        },
      })

      const items = await fetchLovData(requestData, lov2, undefined, noopLog)

      expect(items).toEqual([
        { value: '1', display: 'One', id: '1', label: 'One' },
        { value: '2', display: 'Two', id: '2', label: 'Two' },
      ])
    })
  })

  describe('fetchLookupData', () => {
    const lookup: LookupDefinition = {
      source: 'get-branch-detail',
      resultField: '$.response.data',
      filter: [{ param: 'branchCode', value: '$param.branchCode', required: true }],
    }

    it('extracts lookup object from resultField path', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: {
          data: {
            address: 'Main St 1',
            phone: '+90 212 123 4567',
            manager: 'John',
          },
        },
      })

      const result = await fetchLookupData(requestData, lookup, { branchCode: 'BR-001' }, noopLog)

      expect(requestData).toHaveBeenCalledWith('get-branch-detail', { branchCode: 'BR-001' })
      expect(result).toEqual({
        address: 'Main St 1',
        phone: '+90 212 123 4567',
        manager: 'John',
      })
    })

    it('returns null when path is not object', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: { data: 'string-value' },
      })

      const result = await fetchLookupData(requestData, lookup, { branchCode: 'BR-001' }, noopLog)

      expect(result).toBeNull()
    })

    it('returns null when path is null/undefined', async () => {
      const requestData: RequestDataFn = vi.fn().mockResolvedValue({
        response: { data: null },
      })

      const result = await fetchLookupData(requestData, lookup, { branchCode: 'BR-001' }, noopLog)

      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      const requestData: RequestDataFn = vi.fn().mockRejectedValue(new Error('Failed'))

      const result = await fetchLookupData(requestData, lookup, { branchCode: 'BR-001' }, noopLog)

      expect(result).toBeNull()
    })
  })
})
