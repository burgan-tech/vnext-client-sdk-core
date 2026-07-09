import type { DataSchema, SchemaProperty, MultiLangText, LovItem } from './types'
import { resolveMultiLang } from './expressionResolver'

export function getSchemaProperty(schema: DataSchema, fieldName: string): SchemaProperty | undefined {
  if (typeof fieldName !== 'string' || fieldName.length === 0) return undefined
  const parts = fieldName.split('.')
  let current: SchemaProperty | undefined = schema.properties?.[parts[0]!]
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]!
    if (/^\d+$/.test(seg)) {
      // Sayısal index → array items'ına geç, index'i atla
      current = current?.type === 'array' ? current.items : undefined
    } else if (current?.type === 'array' && current.items?.properties) {
      // Array item'ının property'sine geç
      current = current.items.properties[seg]
    } else {
      current = current?.properties?.[seg]
    }
  }
  return current
}

export function getArrayItemSchema(schema: DataSchema, fieldName: string): SchemaProperty | undefined {
  const prop = getSchemaProperty(schema, fieldName)
  return prop?.type === 'array' ? prop.items : undefined
}

export function getFieldLabel(prop: SchemaProperty | undefined, lang: string): string {
  if (!prop?.['x-labels']) return ''
  return resolveMultiLang(prop['x-labels'], lang)
}

export function getFieldErrorMessage(
  prop: SchemaProperty | undefined,
  errorType: string,
  lang: string
): string {
  const messages = prop?.['x-errorMessages']
  if (!messages?.[errorType]) return ''
  return resolveMultiLang(messages[errorType], lang)
}

export function isFieldRequired(
  schema: DataSchema,
  fieldName: string,
  formData: Record<string, unknown>,
  instanceData: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
): boolean {
  if (schema.required?.includes(fieldName)) return true

  if (schema.allOf) {
    const merged = { ...params, ...instanceData, ...formData }
    for (const rule of schema.allOf) {
      const r = rule as { if?: { properties?: Record<string, { const: unknown }>; required?: string[] }; then?: { required?: string[] } }
      if (r.if?.properties && r.then?.required) {
        const conditionMet = Object.entries(r.if.properties).every(
          ([key, condition]) => merged[key] === condition.const
        )
        if (conditionMet && r.then.required.includes(fieldName)) {
          return true
        }
      }
    }
  }

  return false
}

export function getEnumOptions(
  prop: SchemaProperty | undefined,
  lang: string
): Array<{ value: string; label: string }> {
  if (!prop?.enum) return []

  const xEnum = prop['x-enum']
  return prop.enum.map(val => ({
    value: val,
    label: xEnum?.[val] ? resolveMultiLang(xEnum[val], lang) : val
  }))
}

export function mapLovItemsToOptions(items: LovItem[]): Array<{ value: string; label: string }> {
  return items.map(item => ({
    value: item.value,
    label: item.display
  }))
}

export function validateField(
  prop: SchemaProperty | undefined,
  value: unknown,
  required: boolean,
  lang: string
): string | null {
  if (required && (value === undefined || value === null || value === '')) {
    return getFieldErrorMessage(prop, 'required', lang) || 'This field is required'
  }

  if (value === undefined || value === null || value === '') return null

  const strValue = String(value)

  if (prop?.minLength && strValue.length < prop.minLength) {
    return getFieldErrorMessage(prop, 'minLength', lang) || `Minimum ${prop.minLength} characters`
  }

  if (prop?.maxLength && strValue.length > prop.maxLength) {
    return getFieldErrorMessage(prop, 'maxLength', lang) || `Maximum ${prop.maxLength} characters`
  }

  if (prop?.pattern) {
    const regex = new RegExp(prop.pattern)
    if (!regex.test(strValue)) {
      return getFieldErrorMessage(prop, 'pattern', lang) || 'Invalid format'
    }
  }

  if (prop?.type === 'number' || prop?.type === 'integer') {
    const numValue = Number(value)
    if (prop.minimum !== undefined && numValue < prop.minimum) {
      return getFieldErrorMessage(prop, 'minimum', lang) || `Minimum value is ${prop.minimum}`
    }
    if (prop.maximum !== undefined && numValue > prop.maximum) {
      return getFieldErrorMessage(prop, 'maximum', lang) || `Maximum value is ${prop.maximum}`
    }
  }

  if (prop?.const !== undefined && value !== prop.const) {
    return getFieldErrorMessage(prop, 'const', lang) || 'Invalid value'
  }

  if (prop?.format && typeof value === 'string') {
    const formatError = validateFormat(value, prop.format)
    if (formatError) {
      return getFieldErrorMessage(prop, 'format', lang) || formatError
    }
  }

  return null
}

export interface BindPathEntry {
  path: string
  type?: string
  format?: string
  label?: MultiLangText
  hasLov?: boolean
  hasLookup?: boolean
  required?: boolean
  depth: number
}

export interface EnumerateOptions {
  maxDepth?: number
  includeObjects?: boolean
  prefix?: string
}

export function enumerateBindPaths(
  schema: DataSchema,
  options: EnumerateOptions = {}
): BindPathEntry[] {
  const maxDepth = options.maxDepth ?? 5
  const includeObjects = options.includeObjects ?? true
  const prefix = options.prefix ? `${options.prefix}.` : ''
  const requiredSet = new Set(schema.required ?? [])
  const entries: BindPathEntry[] = []

  function walk(props: Record<string, SchemaProperty> | undefined, parentPath: string, depth: number) {
    if (!props || depth > maxDepth) return
    for (const [name, prop] of Object.entries(props)) {
      const path = parentPath ? `${parentPath}.${name}` : name
      const hasNested = prop.type === 'object' && prop.properties
      if (!hasNested || includeObjects) {
        entries.push({
          path: `${prefix}${path}`,
          type: prop.type,
          format: prop.format,
          label: prop['x-labels'],
          hasLov: !!prop['x-lov'],
          hasLookup: !!prop['x-lookup'],
          required: depth === 0 ? requiredSet.has(name) : false,
          depth,
        })
      }
      if (hasNested) walk(prop.properties, path, depth + 1)
    }
  }

  walk(schema.properties, '', 0)
  return entries
}

function validateFormat(value: string, format: string): string | null {
  switch (format) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Invalid email'
    case 'uri':
    case 'url':
      return /^https?:\/\/.+/.test(value) ? null : 'Invalid URL'
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) ? null : 'Invalid date'
    case 'date-time':
      return !isNaN(Date.parse(value)) ? null : 'Invalid date-time'
    case 'time':
      return /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? null : 'Invalid time'
    case 'phone':
    case 'tel':
      return /^\+?[\d\s()-]{7,}$/.test(value) ? null : 'Invalid phone number'
    case 'iban':
      return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(value.replace(/\s/g, '')) ? null : 'Invalid IBAN'
    default:
      return null
  }
}
