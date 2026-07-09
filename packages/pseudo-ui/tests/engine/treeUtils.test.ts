import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import {
  parseJsonPointer,
  formatJsonPointer,
  getNodeAtPath,
  setNodeAtPath,
  removeNodeAtPath,
  insertNodeAtPath,
  moveNode,
  canDropInto,
} from '../../src/engine/treeUtils'
import type { ComponentNode, ViewDefinition } from '../../src/engine/types'

function sampleView(): ViewDefinition {
  return {
    $schema: 'view-v1',
    dataSchema: 'sample',
    view: {
      type: 'Column',
      children: [
        { type: 'Text', content: 'a' },
        {
          type: 'Card',
          children: [
            { type: 'Text', content: 'b' },
            { type: 'Button', label: 'ok' },
          ],
        },
        { type: 'Text', content: 'c' },
      ],
    },
  } as ViewDefinition
}

describe('JSON Pointer helpers', () => {
  it('parses and formats numeric and string segments', () => {
    expect(parseJsonPointer('/view/children/0')).toEqual(['view', 'children', 0])
    expect(formatJsonPointer(['view', 'children', 0])).toBe('/view/children/0')
  })

  it('escapes ~ and / per RFC 6901', () => {
    expect(formatJsonPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d')
    expect(parseJsonPointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d'])
  })

  it('returns empty segments for empty pointer', () => {
    expect(parseJsonPointer('')).toEqual([])
    expect(formatJsonPointer([])).toBe('')
  })

  it('throws on malformed pointers', () => {
    expect(() => parseJsonPointer('view/children')).toThrow(/Invalid JSON Pointer/)
  })
})

describe('getNodeAtPath', () => {
  it('returns the root view node', () => {
    const node = getNodeAtPath(sampleView(), '/view')
    expect(node?.type).toBe('Column')
  })

  it('returns a nested node', () => {
    const node = getNodeAtPath(sampleView(), '/view/children/1/children/0')
    expect(node).toEqual({ type: 'Text', content: 'b' })
  })

  it('returns undefined for missing paths', () => {
    expect(getNodeAtPath(sampleView(), '/view/children/99')).toBeUndefined()
  })
})

describe('setNodeAtPath', () => {
  it('replaces a leaf without mutating input', () => {
    const original = sampleView()
    const next = setNodeAtPath(original, '/view/children/0', { type: 'Text', content: 'replaced' })
    expect(getNodeAtPath(next, '/view/children/0')).toEqual({ type: 'Text', content: 'replaced' })
    // original untouched
    expect(getNodeAtPath(original, '/view/children/0')).toEqual({ type: 'Text', content: 'a' })
  })
})

describe('removeNodeAtPath', () => {
  it('splices an array element', () => {
    const next = removeNodeAtPath(sampleView(), '/view/children/0')
    const children = (getNodeAtPath(next, '/view') as { children: unknown[] }).children
    expect(children).toHaveLength(2)
    expect((children[0] as { type: string }).type).toBe('Card')
  })
})

describe('insertNodeAtPath', () => {
  it('inserts at the requested index in a flat children array', () => {
    const next = insertNodeAtPath(
      sampleView(),
      '/view',
      'children',
      1,
      { type: 'Text', content: 'inserted' },
    )
    const children = (getNodeAtPath(next, '/view') as { children: { content?: string }[] }).children
    expect(children).toHaveLength(4)
    expect(children[1]).toEqual({ type: 'Text', content: 'inserted' })
  })

  it('replaces a ForEach singular `template` slot', () => {
    const root: ViewDefinition = {
      $schema: 'view-v1',
      dataSchema: 's',
      view: { type: 'ForEach', source: '$form.items', template: { type: 'Text' } },
    } as ViewDefinition
    const next = insertNodeAtPath(root, '/view', 'template', 0, { type: 'Card' })
    expect(getNodeAtPath(next, '/view/template')).toEqual({ type: 'Card' })
  })
})

describe('moveNode', () => {
  it('moves a node into a different parent', () => {
    const next = moveNode(sampleView(), '/view/children/0', '/view/children/1', 'children', 0)
    const cardChildren = (getNodeAtPath(next, '/view/children/0') as { children: { content?: string }[] }).children
    // The Card is now the first child of /view; the moved Text 'a' lives inside it
    expect(cardChildren[0]).toEqual({ type: 'Text', content: 'a' })
  })

  it('reorders within the same parent, adjusting index after splice', () => {
    // Move /view/children/0 ('a') to index 2 inside /view children → expect order: Card, c, a
    const next = moveNode(sampleView(), '/view/children/0', '/view', 'children', 2)
    const children = (getNodeAtPath(next, '/view') as { children: { type: string; content?: string }[] }).children
    expect(children.map(c => c.content ?? c.type)).toEqual(['Card', 'c', 'a'])
  })
})

describe('canDropInto', () => {
  it('returns true for container types', () => {
    expect(canDropInto('Column')).toBe(true)
    expect(canDropInto('Card')).toBe(true)
  })

  it('returns false for leaf types', () => {
    expect(canDropInto('Text')).toBe(false)
    expect(canDropInto('Button')).toBe(false)
  })

  it('returns false for unknown types', () => {
    expect(canDropInto('NoSuchType')).toBe(false)
  })
})

describe('reactive-proxy inputs (Vue designer flow)', () => {
  // Designer callbacks in Vue hand these utilities a `ref().value`, which is a
  // reactive Proxy. structuredClone throws "Proxy object could not be cloned"
  // on those, so deepClone must stay proxy-tolerant.
  it('removeNodeAtPath accepts a reactive view without throwing', () => {
    const r = reactive(sampleView())
    const next = removeNodeAtPath(r as ViewDefinition, '/view/children/0')
    const children = (next.view as { children: ComponentNode[] }).children
    expect(children).toHaveLength(2)
    expect(children[0].type).toBe('Card')
  })

  it('insertNodeAtPath accepts a reactive view without throwing', () => {
    const r = reactive(sampleView())
    const node: ComponentNode = { type: 'Button' } as ComponentNode
    const next = insertNodeAtPath(r as ViewDefinition, '/view', 'children', 0, node)
    expect((next.view as { children: ComponentNode[] }).children[0].type).toBe('Button')
  })
})
