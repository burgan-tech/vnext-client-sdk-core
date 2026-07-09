import type { LovDefinition, LovItem, LookupDefinition, MultiLangText, RequestDataFn, PseudoViewDelegate } from './types'
import { navigatePath, resolveMultiLang } from './expressionResolver'

type LogFn = NonNullable<PseudoViewDelegate['onLog']>

/** Heuristic: a plain object whose values are all strings looks like a
 *  `MultiLangText` map (`{ en: '…', tr: '…' }`). Used to decide whether
 *  to localize a LOV `display` value instead of dumping JSON. */
function looksLikeMultiLang(value: unknown): value is MultiLangText {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length > 0 && entries.every(([, v]) => typeof v === 'string')
}

function noop() {}

/**
 * Resolve a JsonPath-lite expression against an engine response body.
 * Supports the dotted property syntax + JsonPath bracket iteration
 * markers (`[*]`, `[]`, `[N]`) that LOV / lookup authors use in
 * `valueField` / `displayField` / `resultField`.
 *
 *   `$.data[*]`               → body.data        (array)
 *   `$.response.items[0]`     → body.response.items[0]
 *   `$.data`                  → body.data
 *
 * Bracket markers are stripped before walking; downstream consumers
 * (LOV / lookup) split the *array container* path and the per-item
 * key separately via `splitArrayPath` so a `valueField` like
 * `$.data[*].name.en` projects to `name.en` against each item.
 */
function extractByPath(obj: unknown, path: string): unknown {
  const stripped = path
    .replace(/^\$\./, '')
    // Drop JsonPath bracket markers (`[*]`, `[]`, `[0]`, etc.) — they
    // immediately follow a property name like `data[*]` → `data`.
    .replace(/\[[^\]]*\]/g, '')
  return navigatePath(obj, stripped.split('.').filter((s) => s.length > 0))
}

/**
 * Split a LOV `valueField` / `displayField` into the array-container
 * path and the per-item key path. Two authoring conventions are
 * accepted:
 *
 *   1. Bracket-marked (canonical JsonPath):
 *      `$.data[*].code`        → { array: ['data'],            item: ['code']       }
 *      `$.data[].name.en`      → { array: ['data'],            item: ['name','en']  }
 *      `$.response.data[*].id` → { array: ['response','data'], item: ['id']         }
 *
 *   2. No bracket (legacy dotted, last segment is the item key):
 *      `response.data.items.code` → { array: ['response','data','items'], item: ['code'] }
 *      `data.code`                → { array: ['data'],                    item: ['code'] }
 *      `list`                     → { array: [],                          item: ['list'] }  — degenerate
 *
 * Returns `null` for empty input.
 */
function splitArrayPath(field: string): { array: string[]; item: string[] } | null {
  if (typeof field !== 'string' || !field.trim()) return null
  const stripped = field.trim().replace(/^\$\./, '')

  // Bracket-marked form takes precedence so authors who explicitly
  // declare the array boundary get a multi-segment item path.
  const match = stripped.match(/^([^\[]+)\[[^\]]*\](?:\.(.+))?$/)
  if (match) {
    const arrayPath = (match[1] ?? '').split('.').filter((s) => s.length > 0)
    const itemPath = (match[2] ?? '').split('.').filter((s) => s.length > 0)
    if (arrayPath.length === 0) return null
    return { array: arrayPath, item: itemPath }
  }

  // Legacy dotted form: last segment is the per-item key, the rest
  // is the array container. Always a 1-segment item path for
  // backward compatibility with views authored before R25.E-4.
  const segments = stripped.split('.').filter((s) => s.length > 0)
  if (segments.length === 0) return null
  if (segments.length === 1) {
    return { array: [], item: segments }
  }
  return { array: segments.slice(0, -1), item: segments.slice(-1) }
}

export async function fetchLovData(
  requestData: RequestDataFn,
  lov: LovDefinition,
  queryParams?: Record<string, string>,
  log: LogFn = noop,
  /** Current locale — used to flatten multi-lang `display` values
   *  (`{ en, tr }`) into a localized string. Defaults to 'en' when
   *  the caller doesn't thread the active language. */
  lang = 'en',
): Promise<LovItem[]> {
  try {
    log('debug', `requestData → ${lov.source}`, undefined, { source: 'LOV', ref: lov.source, params: queryParams })
    const body = await requestData(lov.source, queryParams)
    log('debug', `requestData ← ${lov.source} responded`, undefined, { source: 'LOV', ref: lov.source })

    // The two fields share an array path (`$.data[*]`) and each
    // declares its own per-item key. Splitting separately lets us
    // tolerate authoring like `$.data[*].name.en` (nested per-item
    // path) without conflating the array and item portions.
    const valueSplit = splitArrayPath(lov.valueField)
    const displaySplit = splitArrayPath(lov.displayField)
    if (!valueSplit || !displaySplit) {
      log('warn', `Invalid valueField/displayField on ${lov.source}`, undefined, {
        source: 'LOV',
        ref: lov.source,
        valueField: lov.valueField,
        displayField: lov.displayField,
      })
      return []
    }

    const rawItems = navigatePath(body, valueSplit.array)
    if (!Array.isArray(rawItems)) {
      log('warn', `Expected array at data path for ${lov.source}, got ${typeof rawItems}`, undefined, { source: 'LOV', ref: lov.source })
      return []
    }

    const items = rawItems.map((item: Record<string, unknown>) => {
      const rawValue =
        valueSplit.item.length === 0 ? item : navigatePath(item, valueSplit.item)
      const rawDisplay =
        displaySplit.item.length === 0 ? item : navigatePath(item, displaySplit.item)
      return {
        ...item,
        value: rawValue == null ? '' : String(rawValue),
        // `display` flattens to a localized string for the SDK's
        // option label. When the engine returns a multi-lang map
        // (`{ en: 'Kadıköy Branch', tr: 'Kadıköy Şubesi' }`) we
        // resolve it against the active `lang` (en → tr → first
        // fallback). Non-multilang objects fall back to JSON so the
        // misconfiguration is at least visible rather than
        // "[object Object]".
        display:
          rawDisplay == null
            ? ''
            : looksLikeMultiLang(rawDisplay)
            ? resolveMultiLang(rawDisplay, lang)
            : typeof rawDisplay === 'object'
            ? JSON.stringify(rawDisplay)
            : String(rawDisplay),
      }
    })
    log('debug', `LOV "${lov.source}" extracted ${items.length} item(s)`, undefined, { source: 'LOV', ref: lov.source, count: items.length })
    return items
  } catch (e) {
    log('error', `Failed to fetch LOV: ${lov.source}`, e, { source: 'LOV', ref: lov.source })
    return []
  }
}

export async function fetchLookupData(
  requestData: RequestDataFn,
  lookup: LookupDefinition,
  queryParams?: Record<string, string>,
  log: LogFn = noop,
): Promise<Record<string, unknown> | null> {
  try {
    log('debug', `requestData → ${lookup.source}`, undefined, { source: 'LOOKUP', ref: lookup.source, params: queryParams })
    const body = await requestData(lookup.source, queryParams)
    log('debug', `requestData ← ${lookup.source} responded`, undefined, { source: 'LOOKUP', ref: lookup.source })

    const result = extractByPath(body, lookup.resultField)

    if (result == null || typeof result !== 'object') {
      log('warn', `Expected object at ${lookup.resultField} for ${lookup.source}, got ${typeof result}`, undefined, { source: 'LOOKUP', ref: lookup.source })
      return null
    }

    log('debug', `Lookup "${lookup.source}" extracted`, undefined, { source: 'LOOKUP', ref: lookup.source, keys: Object.keys(result as Record<string, unknown>) })
    return result as Record<string, unknown>
  } catch (e) {
    log('error', `Failed to fetch lookup: ${lookup.source}`, e, { source: 'LOOKUP', ref: lookup.source })
    return null
  }
}
