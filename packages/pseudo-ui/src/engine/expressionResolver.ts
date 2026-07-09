import type { FormContext, MultiLangText, LovFilterParam } from './types'

export function resolveExpression(expr: string, ctx: FormContext, item?: Record<string, unknown>): unknown {
  if (!expr || !expr.startsWith('$')) return expr

  const parts = expr.split('.')
  const root = parts[0]
  const path = parts.slice(1)

  let value: unknown

  switch (root) {
    case '$schema': {
      const fieldName = path[0]
      const prop = fieldName ? ctx.schema.properties?.[fieldName] : undefined
      if (prop && path[1] === 'label') {
        value = prop['x-labels']
      } else if (prop) {
        value = navigatePath(prop, path.slice(1))
      } else {
        value = navigatePath(ctx.schema, path)
      }
      break
    }
    case '$form':
      value = navigatePath(ctx.formData, path)
      break
    case '$instance':
      value = navigatePath(ctx.instanceData, path)
      break
    case '$param':
      value = navigatePath(ctx.params, path)
      break
    case '$lov': {
      if (path.length === 0) { value = ctx.lovData; break }
      const lovField = path[0]!
      const items = ctx.lovData[lovField]
      if (path.length >= 2 && path[1] === 'display') {
        const currentVal = ctx.params[lovField] ?? ctx.formData[lovField] ?? ctx.instanceData[lovField]
        if (items && currentVal != null) {
          const match = items.find(i => i.value === currentVal)
          value = match?.display ?? String(currentVal)
        } else {
          value = currentVal
        }
      } else {
        value = items
      }
      break
    }
    case '$lookup':
      if (path.length > 0) {
        const lookupObj = ctx.lookupData[path[0]!]
        value = path.length > 1 ? navigatePath(lookupObj, path.slice(1)) : lookupObj
      } else {
        value = ctx.lookupData
      }
      break
    case '$ui':
      value = navigatePath(ctx.uiState, path)
      break
    case '$item':
      value = item ? navigatePath(item, path) : undefined
      break
    case '$context':
      if (path[0] === 'lang') value = ctx.lang
      break
    default:
      value = expr
  }

  return value
}

export function resolveTextContent(
  content: string | MultiLangText | undefined,
  ctx: FormContext,
  item?: Record<string, unknown>
): string {
  if (!content) return ''

  if (typeof content === 'string') {
    if (content.startsWith('$')) {
      const resolved = resolveExpression(content, ctx, item)
      if (typeof resolved === 'object' && resolved !== null) {
        return resolveMultiLang(resolved as MultiLangText, ctx.lang)
      }
      const strVal = String(resolved ?? '')
      const enumLabel = tryResolveEnumLabel(content, strVal, ctx)
      return enumLabel ?? strVal
    }
    return content
  }

  return resolveMultiLang(content, ctx.lang)
}

function tryResolveEnumLabel(expr: string, rawValue: string, ctx: FormContext): string | null {
  if (!rawValue || !ctx.schema.properties) return null
  const parts = expr.split('.')
  if (parts.length < 2) return null
  const fieldName = parts[1]!
  const prop = ctx.schema.properties[fieldName]
  if (!prop?.['x-enum']?.[rawValue]) return null
  return resolveMultiLang(prop['x-enum'][rawValue], ctx.lang)
}

export function resolveMultiLang(text: MultiLangText | undefined, lang: string): string {
  if (!text) return ''
  return text[lang] || text['en'] || text['tr'] || Object.values(text)[0] || ''
}

export function resolveFilterParams(
  filter: LovFilterParam[],
  formData: Record<string, unknown>,
  instanceData: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
): Record<string, string> | null {
  const result: Record<string, string> = {}
  for (const f of filter) {
    let val: unknown
    if (f.value.startsWith('$param.')) {
      val = navigatePath(params, f.value.slice(7).split('.'))
    } else if (f.value.startsWith('$form.')) {
      val = navigatePath(formData, f.value.slice(6).split('.'))
    } else if (f.value.startsWith('$instance.')) {
      val = navigatePath(instanceData, f.value.slice(10).split('.'))
    } else {
      result[f.param] = f.value
      continue
    }
    if (val != null && val !== '') {
      result[f.param] = String(val)
    } else if (f.required) {
      return null
    }
  }
  return result
}

export interface DynamicFilterFields {
  formFields: string[]
  instanceFields: string[]
  paramFields: string[]
}

export function extractDynamicFilterFields(filter: LovFilterParam[]): DynamicFilterFields {
  return {
    formFields: filter.filter(f => f.value.startsWith('$form.')).map(f => f.value.slice(6)),
    instanceFields: filter.filter(f => f.value.startsWith('$instance.')).map(f => f.value.slice(10)),
    paramFields: filter.filter(f => f.value.startsWith('$param.')).map(f => f.value.slice(7)),
  }
}

export function areRequiredFiltersMet(
  filter: LovFilterParam[],
  formData: Record<string, unknown>,
  instanceData: Record<string, unknown>,
  params: Record<string, unknown> = {},
): boolean {
  return filter.filter(f => f.required).every(f => {
    let v: unknown
    if (f.value.startsWith('$param.')) {
      v = params[f.value.slice(7)]
    } else if (f.value.startsWith('$form.')) {
      v = formData[f.value.slice(6)]
    } else if (f.value.startsWith('$instance.')) {
      v = instanceData[f.value.slice(10)]
    } else {
      return true
    }
    return v != null && v !== ''
  })
}

export function navigatePath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
