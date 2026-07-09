import { describe, it, expect } from 'vitest'
import { adoptStylesIntoRoot } from '../../src/adapters/vue/styleInjection'

function makeShadow(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

describe('adoptStylesIntoRoot (Vue export)', () => {
  it('adopts a stylesheet into a ShadowRoot', () => {
    const root = makeShadow()
    adoptStylesIntoRoot(root, ['.x { color: red }'])
    expect(root.adoptedStyleSheets.length).toBe(1)
  })

  it('appends without clobbering existing adopted sheets', () => {
    const root = makeShadow()
    const existing = new CSSStyleSheet()
    existing.replaceSync('.pre { color: blue }')
    root.adoptedStyleSheets = [existing]

    adoptStylesIntoRoot(root, ['.x { color: red }'])

    expect(root.adoptedStyleSheets.length).toBe(2)
    expect(root.adoptedStyleSheets[0]).toBe(existing)
  })

  it('is idempotent for the same css text on the same root', () => {
    const root = makeShadow()
    adoptStylesIntoRoot(root, ['.x { color: red }'])
    adoptStylesIntoRoot(root, ['.x { color: red }'])
    expect(root.adoptedStyleSheets.length).toBe(1)
  })

  it('reuses cached sheets across roots in the same document', () => {
    const a = makeShadow()
    const b = makeShadow()
    const css = '.shared { color: green }'
    adoptStylesIntoRoot(a, [css])
    adoptStylesIntoRoot(b, [css])
    expect(a.adoptedStyleSheets[0]).toBe(b.adoptedStyleSheets[0])
  })

  it('no-ops on empty css list', () => {
    const root = makeShadow()
    adoptStylesIntoRoot(root, [])
    expect(root.adoptedStyleSheets.length).toBe(0)
  })
})
