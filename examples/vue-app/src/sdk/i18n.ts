// ─────────────────────────────────────────────────────────────────────────
// Locale resolution for backend-provided labels.
//
// Backend content carries localizable text as the core `[{ language, label }]`
// array (also tolerating a plain string or `{ <lang>: text }` map). Resolution
// is the canonical pseudo-ui `localizeLabel` — one implementation shared across
// the renderer and this host, so a label localizes identically everywhere.
// ─────────────────────────────────────────────────────────────────────────
import { localizeLabel } from '@burgan-tech/pseudo-ui';
import type { LocalizedText } from '@burgan-tech/app-host';

/** Resolve a localizable value to a plain string for the given locale. */
export function localize(value: LocalizedText | undefined | null, locale: string): string {
  return localizeLabel(value, locale);
}
