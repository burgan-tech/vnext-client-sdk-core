import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { componentMeta, getComponentMeta, listComponentTypes } from '../../src/engine/componentMeta'

const __dirname = dirname(fileURLToPath(import.meta.url))
const vocabularyPath = resolve(__dirname, '../../vocabularies/view-vocabulary.json')

function vocabularyComponentTypes(): string[] {
  const raw = readFileSync(vocabularyPath, 'utf8')
  const vocab = JSON.parse(raw) as {
    $defs?: Record<string, { properties?: { type?: { const?: string } } }>
  }
  const defs = vocab.$defs ?? {}
  const types: string[] = []
  for (const [key, def] of Object.entries(defs)) {
    if (!key.endsWith('Component')) continue
    const constType = def.properties?.type?.const
    if (typeof constType === 'string') types.push(constType)
  }
  return types
}

describe('componentMeta', () => {
  describe('vocabulary sync', () => {
    it('covers every component type defined in view-vocabulary.json', () => {
      const vocabTypes = vocabularyComponentTypes()
      expect(vocabTypes.length).toBeGreaterThan(0)
      const metaTypes = new Set(listComponentTypes())
      const missing = vocabTypes.filter(t => !metaTypes.has(t))
      expect(missing).toEqual([])
    })

    it('does not declare types absent from the vocabulary', () => {
      const vocabSet = new Set(vocabularyComponentTypes())
      const extra = listComponentTypes().filter(t => !vocabSet.has(t))
      expect(extra).toEqual([])
    })
  })

  describe('shape invariants', () => {
    it('every entry has type matching its key', () => {
      for (const [key, meta] of Object.entries(componentMeta)) {
        expect(meta.type).toBe(key)
      }
    })

    it('every entry has a valid category', () => {
      const valid = new Set(['layout', 'container', 'input', 'display', 'action', 'navigation', 'controlFlow'])
      for (const meta of Object.values(componentMeta)) {
        expect(valid.has(meta.category)).toBe(true)
      }
    })

    it('acceptsChildren=false entries omit child container fields', () => {
      for (const meta of Object.values(componentMeta)) {
        if (!meta.acceptsChildren) {
          expect(meta.childContainerKey).toBeUndefined()
          expect(meta.childContainerShape).toBeUndefined()
        }
      }
    })

    it('acceptsChildren=true entries declare childContainerKey and shape', () => {
      for (const meta of Object.values(componentMeta)) {
        if (meta.acceptsChildren) {
          expect(meta.childContainerKey).toBeTruthy()
          expect(['flat', 'wrapped']).toContain(meta.childContainerShape)
        }
      }
    })
  })

  describe('representative entries', () => {
    it('Column is a flat layout container', () => {
      const m = getComponentMeta('Column')
      expect(m?.category).toBe('layout')
      expect(m?.childContainerKey).toBe('children')
      expect(m?.childContainerShape).toBe('flat')
    })

    it('TabView is a wrapped container', () => {
      const m = getComponentMeta('TabView')
      expect(m?.childContainerKey).toBe('tabs')
      expect(m?.childContainerShape).toBe('wrapped')
    })

    it('ForEach uses template as child container', () => {
      const m = getComponentMeta('ForEach')
      expect(m?.category).toBe('controlFlow')
      expect(m?.childContainerKey).toBe('template')
      expect(m?.childContainerShape).toBe('wrapped')
    })

    it('TextField is bindable and atomic', () => {
      const m = getComponentMeta('TextField')
      expect(m?.category).toBe('input')
      expect(m?.bindable).toBe(true)
      expect(m?.acceptsChildren).toBe(false)
    })

    it('Button is atomic action', () => {
      const m = getComponentMeta('Button')
      expect(m?.category).toBe('action')
      expect(m?.acceptsChildren).toBe(false)
    })

    it('getComponentMeta returns undefined for unknown type', () => {
      expect(getComponentMeta('NotARealComponent')).toBeUndefined()
    })
  })
})
