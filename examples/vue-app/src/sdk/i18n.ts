// ─────────────────────────────────────────────────────────────────────────
// Locale resolution for backend-provided labels.
//
// Nav records (and other backend content) carry localizable text as an array of
// { language, label } entries — the same shape as the core definition `labels`
// — so new languages can be added without a client change. This resolves such a
// value against the active UI locale (e.g. "en" ↔ "en-US"), tolerating the older
// plain-string and { <lang>: text } map forms too.
// ─────────────────────────────────────────────────────────────────────────
import type { LocalizedText } from '@burgan-tech/app-host';

/** First subtag, lowercased: "en-US" → "en", "tr" → "tr". */
function base(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0] ?? lang.toLowerCase();
}

/** Resolve a localizable value to a plain string for the given locale. */
export function localize(value: LocalizedText | undefined | null, locale: string): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const want = base(locale);
  if (Array.isArray(value)) {
    const hit = value.find((e) => base(e.language) === want) ?? value[0];
    return hit?.label ?? '';
  }
  const rec = value as Record<string, string>;
  return rec[locale] ?? rec[want] ?? Object.values(rec)[0] ?? '';
}
