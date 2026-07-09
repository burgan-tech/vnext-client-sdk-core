import type { ComponentNode, ViewDefinition } from './types'
import { getComponentMeta } from './componentMeta'

/**
 * RFC 6901 JSON Pointer helpers and immutable tree mutation utilities
 * used by designer-mode hosts (e.g. Forge ViewDesigner) to manipulate a
 * ViewDefinition tree returned from `<PseudoView>` designer callbacks.
 *
 * Path examples (relative to the ViewDefinition root):
 *   /view                            → the root view node
 *   /view/children/0                 → first child of a flat container
 *   /view/tabs/1/content/2           → 3rd item in 2nd tab's content
 *   /view/steps/0/content/0/actions/0
 *   /view/template                   → ForEach singular template node
 */

const ESCAPE_RE = /~/g
const SLASH_RE = /\//g

function escapeSegment(seg: string | number): string {
  if (typeof seg === 'number') return String(seg)
  return seg.replace(ESCAPE_RE, '~0').replace(SLASH_RE, '~1')
}

function unescapeSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function parseJsonPointer(pointer: string): (string | number)[] {
  if (pointer === '' || pointer === '/') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`Invalid JSON Pointer (must start with '/'): ${pointer}`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map(seg => {
      const u = unescapeSegment(seg)
      // Numeric segment → array index (only if pure digits)
      return /^\d+$/.test(u) ? Number(u) : u
    })
}

export function formatJsonPointer(segments: (string | number)[]): string {
  if (segments.length === 0) return ''
  return '/' + segments.map(escapeSegment).join('/')
}

function deepClone<T>(value: T): T {
  // ViewDefinition trees are pure JSON (no functions/Dates/Maps), so a JSON
  // round-trip is both sufficient and *proxy-tolerant*: designer callbacks
  // are routinely handed a framework-reactive object (e.g. a Vue `ref().value`
  // or a signal payload), and `structuredClone` throws "Proxy object could
  // not be cloned" on those. Reading via JSON.stringify unwraps the proxy to
  // plain data.
  return JSON.parse(JSON.stringify(value))
}

function walk(root: unknown, segments: (string | number)[]): unknown {
  let cur: unknown = root
  for (const seg of segments) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      if (typeof seg !== 'number') return undefined
      cur = cur[seg]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[String(seg)]
    } else {
      return undefined
    }
  }
  return cur
}

export function getNodeAtPath(root: ViewDefinition, pointer: string): ComponentNode | undefined {
  const segments = parseJsonPointer(pointer)
  const result = walk(root, segments)
  return result && typeof result === 'object' ? (result as ComponentNode) : undefined
}

/**
 * Mutate a deep clone of `root` at `pointer` via `mutator`, return the new root.
 * Throws if the parent path doesn't exist.
 */
function mutateAtPath(
  root: ViewDefinition,
  pointer: string,
  mutator: (parent: Record<string, unknown> | unknown[], lastKey: string | number) => void,
): ViewDefinition {
  const segments = parseJsonPointer(pointer)
  if (segments.length === 0) {
    throw new Error('Cannot mutate the root of a ViewDefinition via mutateAtPath')
  }
  const next = deepClone(root)
  const parentSegments = segments.slice(0, -1)
  const lastKey = segments[segments.length - 1]
  const parent = walk(next, parentSegments)
  if (parent == null || typeof parent !== 'object') {
    throw new Error(`Parent path not found for pointer: ${pointer}`)
  }
  mutator(parent as Record<string, unknown> | unknown[], lastKey)
  return next
}

export function setNodeAtPath(
  root: ViewDefinition,
  pointer: string,
  node: ComponentNode,
): ViewDefinition {
  return mutateAtPath(root, pointer, (parent, key) => {
    if (Array.isArray(parent)) {
      if (typeof key !== 'number') throw new Error(`Array parent requires numeric key, got ${String(key)}`)
      parent[key] = node
    } else {
      ;(parent as Record<string, unknown>)[String(key)] = node
    }
  })
}

export function removeNodeAtPath(root: ViewDefinition, pointer: string): ViewDefinition {
  return mutateAtPath(root, pointer, (parent, key) => {
    if (Array.isArray(parent)) {
      if (typeof key !== 'number') throw new Error(`Array parent requires numeric key, got ${String(key)}`)
      parent.splice(key, 1)
    } else {
      delete (parent as Record<string, unknown>)[String(key)]
    }
  })
}

/**
 * Insert a node into a parent collection. `parentPointer` points at the
 * parent ComponentNode itself; `key` is the child-collection field name
 * (e.g. `children`, `actions`, `items`, `destinations`, `tabs`, `steps`,
 * `template`). For flat arrays the node is spliced at `index`; for the
 * singular `template` slot the node replaces whatever is there.
 *
 * For wrapped collections (tabs/steps), inserting a ComponentNode directly
 * isn't meaningful — callers should manipulate `tabs[i].content` or
 * `steps[i].content` instead, whose pointers are normal flat arrays.
 */
export function insertNodeAtPath(
  root: ViewDefinition,
  parentPointer: string,
  key: string,
  index: number,
  node: ComponentNode,
): ViewDefinition {
  const next = deepClone(root)
  const segments = parseJsonPointer(parentPointer)
  const parent = walk(next, segments)
  if (parent == null || typeof parent !== 'object') {
    throw new Error(`Parent path not found: ${parentPointer}`)
  }
  const obj = parent as Record<string, unknown>
  const current = obj[key]
  if (key === 'template') {
    obj[key] = node
    return next
  }
  if (!Array.isArray(current)) {
    obj[key] = [node]
    return next
  }
  const idx = Math.max(0, Math.min(index, current.length))
  current.splice(idx, 0, node)
  return next
}

/**
 * Translate a target pointer to reflect the state *after* `fromPointer` has
 * been removed. When source and target share a numeric ancestor in the same
 * array and the source index is lower, the target index shifts down by one.
 */
function translatePointerAfterRemoval(fromPointer: string, target: string): string {
  const fromSegs = parseJsonPointer(fromPointer)
  const targetSegs = parseJsonPointer(target)
  // Find first index where they diverge.
  let i = 0
  while (i < fromSegs.length && i < targetSegs.length && fromSegs[i] === targetSegs[i]) i++
  // For target to be affected, the divergence must occur on the source's
  // **last** segment (i.e. they share the same parent collection), both must
  // be numeric (array indices), and source < target.
  if (i !== fromSegs.length - 1) return target
  const sourceTail = fromSegs[i]
  const targetTail = targetSegs[i]
  if (typeof sourceTail !== 'number' || typeof targetTail !== 'number') return target
  if (sourceTail >= targetTail) return target
  const next = [...targetSegs]
  next[i] = (targetTail as number) - 1
  return formatJsonPointer(next)
}

/**
 * Move a node from `fromPointer` to position `index` inside
 * `toParentPointer`'s `key` collection. All pointers are relative to the
 * **input** `root`. `index` is interpreted in the post-removal state of
 * the destination collection (the position the node should end up at).
 */
export function moveNode(
  root: ViewDefinition,
  fromPointer: string,
  toParentPointer: string,
  key: string,
  index: number,
): ViewDefinition {
  const moving = getNodeAtPath(root, fromPointer)
  if (!moving) throw new Error(`Source node not found at ${fromPointer}`)
  const removed = removeNodeAtPath(root, fromPointer)
  const translatedTarget = translatePointerAfterRemoval(fromPointer, toParentPointer)
  return insertNodeAtPath(removed, translatedTarget, key, index, moving)
}

/**
 * Lightweight drop-target compatibility check using `componentMeta`.
 * Returns true when `targetType` accepts children and (optionally) the
 * dragged type isn't forbidden by an explicit allow-list (future).
 *
 * The first iteration only checks `acceptsChildren`; tighter allowed-type
 * rules can be layered on top (e.g. NavigationBar destinations expect
 * navigation items, not arbitrary widgets).
 */
export function canDropInto(targetType: string, _draggedType?: string): boolean {
  const meta = getComponentMeta(targetType)
  return Boolean(meta?.acceptsChildren)
}
