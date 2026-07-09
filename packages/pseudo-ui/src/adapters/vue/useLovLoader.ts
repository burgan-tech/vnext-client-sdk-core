import { watch, ref } from 'vue'
import type { FormContext, RequestDataFn, LovFilterParam, PseudoViewDelegate } from '../../engine/types'
import { resolveFilterParams, extractDynamicFilterFields, areRequiredFiltersMet } from '../../engine/expressionResolver'
import { fetchLovData } from '../../engine/dataClient'

type LogFn = NonNullable<PseudoViewDelegate['onLog']>

/**
 * Loads LOV data for a single field and updates ctx.lovData.
 * Shared by DynamicRenderer and NestedComponentWrapper.
 */
export async function loadLovForField(
  fieldName: string,
  ctx: FormContext,
  requestData: RequestDataFn,
  log: LogFn = () => {},
  options?: { filter?: LovFilterParam[] }
): Promise<void> {
  const prop = ctx.schema.properties?.[fieldName]
  if (!prop?.['x-lov']) return

  const lov = prop['x-lov']
  const effectiveFilter = options?.filter ?? lov.filter

  try {
    if (effectiveFilter?.length) {
      const queryParams = resolveFilterParams(
        effectiveFilter,
        ctx.formData,
        ctx.instanceData,
        ctx.params
      )
      if (queryParams === null) {
        ctx.lovData[fieldName] = []
        log('debug', `LOV "${fieldName}" skipped — required filter params not met`, undefined, {
          source: 'LOV',
          field: fieldName,
        })
        return
      }
      const items = await fetchLovData(requestData, lov, queryParams, log)
      ctx.lovData[fieldName] = items
      log('info', `LOV "${fieldName}" loaded: ${items.length} item(s)`, undefined, {
        source: 'LOV',
        field: fieldName,
        count: items.length,
      })
    } else {
      const items = await fetchLovData(requestData, lov, undefined, log)
      ctx.lovData[fieldName] = items
      log('info', `LOV "${fieldName}" loaded: ${items.length} item(s)`, undefined, {
        source: 'LOV',
        field: fieldName,
        count: items.length,
      })
    }
  } catch (err) {
    log('error', `Failed to load LOV for field "${fieldName}"`, err, {
      source: 'LOV',
      field: fieldName,
    })
    ctx.lovData[fieldName] = []
  }
}

/**
 * Returns true if any filter value references a field in changedFields.
 * Used when parent bound values change — reload LOVs that depend on those fields.
 */
export function isLovFilterAffectedByChanges(
  filter: LovFilterParam[] | undefined,
  changedFields: string[]
): boolean {
  if (!filter?.length || !changedFields.length) return false

  for (const f of filter) {
    let path: string
    if (f.value.startsWith('$param.')) {
      path = f.value.slice(7)
    } else if (f.value.startsWith('$form.')) {
      path = f.value.slice(6)
    } else if (f.value.startsWith('$instance.')) {
      path = f.value.slice(10)
    } else {
      continue
    }
    const firstSegment = path.split('.')[0]
    if (firstSegment && changedFields.includes(firstSegment)) return true
  }
  return false
}

/**
 * Composable: loads LOV for one field, sets up watch on filter dependencies, returns loading state.
 * Used by DynamicRenderer for dropdown/select fields.
 */
export function useLovLoader(
  fieldName: string | undefined,
  ctx: FormContext,
  requestData: RequestDataFn,
  log: LogFn = () => {}
) {
  const loading = ref(false)

  async function load() {
    if (!fieldName) return
    loading.value = true
    try {
      await loadLovForField(fieldName, ctx, requestData, log)
    } finally {
      loading.value = false
    }
  }

  function setupWatch() {
    if (!fieldName) return
    const prop = ctx.schema.properties?.[fieldName]
    const lov = prop?.['x-lov']
    if (!lov) return

    if (lov.filter?.length) {
      const { formFields, instanceFields, paramFields } = extractDynamicFilterFields(lov.filter)

      if (formFields.length > 0 || instanceFields.length > 0 || paramFields.length > 0) {
        watch(
          () => [
            ...formFields.map((f) => ctx.formData[f]),
            ...instanceFields.map((f) => ctx.instanceData[f]),
            ...paramFields.map((f) => ctx.params[f]),
          ],
          () => {
            if (areRequiredFiltersMet(lov.filter!, ctx.formData, ctx.instanceData, ctx.params)) {
              ctx.formData[fieldName] = undefined
              load()
            }
          },
          { immediate: areRequiredFiltersMet(lov.filter!, ctx.formData, ctx.instanceData, ctx.params) }
        )
      } else {
        load()
      }
    } else {
      load()
    }
  }

  return { load, loading, setupWatch }
}
