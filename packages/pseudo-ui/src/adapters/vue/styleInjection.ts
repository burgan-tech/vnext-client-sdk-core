const sheetCache = new WeakMap<Document | ShadowRootHost, Map<string, CSSStyleSheet>>()

type ShadowRootHost = { adoptedStyleSheets: CSSStyleSheet[] }

function supportsConstructableStylesheets(): boolean {
  if (typeof document === 'undefined') return false
  try {
    new CSSStyleSheet()
    return true
  } catch {
    return false
  }
}

function getOrCreateSheet(root: ShadowRoot, cssText: string): CSSStyleSheet {
  const ownerDoc = root.ownerDocument ?? document
  let perDoc = sheetCache.get(ownerDoc)
  if (!perDoc) {
    perDoc = new Map()
    sheetCache.set(ownerDoc, perDoc)
  }
  let sheet = perDoc.get(cssText)
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(cssText)
    perDoc.set(cssText, sheet)
  }
  return sheet
}

function injectStyleTag(root: ShadowRoot, cssText: string): void {
  const marker = `data-pseudo-ui-style-${hashString(cssText)}`
  if (root.querySelector(`style[${marker}]`)) return
  const styleEl = (root.ownerDocument ?? document).createElement('style')
  styleEl.setAttribute(marker, '')
  styleEl.textContent = cssText
  root.appendChild(styleEl)
}

function hashString(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i)
  return (h >>> 0).toString(36)
}

/**
 * Adopt one or more CSS texts into a ShadowRoot so they apply to its tree.
 *
 * Uses Constructable Stylesheets (`adoptedStyleSheets`) when supported,
 * with cached `CSSStyleSheet` instances per document so the same text is
 * not re-parsed for additional roots. Falls back to a `<style>` tag per
 * root when constructable sheets are unavailable (older Safari).
 *
 * Existing entries on `root.adoptedStyleSheets` are preserved.
 */
export function adoptStylesIntoRoot(root: ShadowRoot, cssTexts: string[]): void {
  if (!root || cssTexts.length === 0) return
  if (supportsConstructableStylesheets()) {
    const next: CSSStyleSheet[] = []
    for (const text of cssTexts) {
      const sheet = getOrCreateSheet(root, text)
      if (!root.adoptedStyleSheets.includes(sheet)) next.push(sheet)
    }
    if (next.length > 0) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...next]
    }
    return
  }
  for (const text of cssTexts) injectStyleTag(root, text)
}
