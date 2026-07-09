import { watch } from 'vue'
import type { FormContext, RequestDataFn, PseudoViewDelegate } from '../../engine/types'
import { resolveFilterParams, extractDynamicFilterFields, areRequiredFiltersMet } from '../../engine/expressionResolver'
import { fetchLookupData } from '../../engine/dataClient'

type LogFn = NonNullable<PseudoViewDelegate['onLog']>

export function useLookups(lookupNames: string[], ctx: FormContext, requestData: RequestDataFn, log: LogFn = () => {}) {
  if (!lookupNames.length || !ctx.schema.properties) return

  for (const propName of lookupNames) {
    const schemaProp = ctx.schema.properties[propName]
    if (!schemaProp?.['x-lookup']) continue

    const lookup = schemaProp['x-lookup']

    async function loadLookup() {
      const queryParams = lookup.filter?.length
        ? resolveFilterParams(lookup.filter, ctx.formData, ctx.instanceData, ctx.params)
        : {}

      if (queryParams === null) {
        log('debug', `Lookup "${propName}" skipped — required filter params not met`, undefined, { source: 'Lookup', field: propName })
        delete ctx.lookupData[propName]
        return
      }

      log('debug', `Fetching lookup "${propName}"`, undefined, { source: 'Lookup', field: propName, params: queryParams })

      const result = await fetchLookupData(requestData, lookup, queryParams, log)
      if (result) {
        ctx.lookupData[propName] = result
        log('info', `Lookup "${propName}" loaded`, undefined, { source: 'Lookup', field: propName, keys: Object.keys(result) })
      } else {
        delete ctx.lookupData[propName]
      }
    }

    if (lookup.filter?.length) {
      const { formFields, instanceFields, paramFields } = extractDynamicFilterFields(lookup.filter)

      if (formFields.length > 0 || instanceFields.length > 0 || paramFields.length > 0) {
        log('debug', `Lookup "${propName}" watching fields`, undefined, { source: 'Lookup', field: propName, formFields, instanceFields, paramFields })
        watch(
          () => [
            ...formFields.map(field => ctx.formData[field]),
            ...instanceFields.map(field => ctx.instanceData[field]),
            ...paramFields.map(field => ctx.params[field]),
          ],
          () => loadLookup(),
          { immediate: areRequiredFiltersMet(lookup.filter!, ctx.formData, ctx.instanceData, ctx.params) },
        )
      } else {
        loadLookup()
      }
    } else {
      loadLookup()
    }
  }
}
