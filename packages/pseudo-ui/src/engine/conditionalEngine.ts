import type { ConditionalDefinition, ConditionRule } from './types'

export interface ConditionalState {
  visible: boolean
  enabled: boolean
}

export interface EvaluateConditionalOptions {
  /**
   * When true, the visibility result is forced to `true` regardless of
   * `showIf` / `hideIf` rules. Used by designer/preview mode so view.json
   * editors can see hidden states. The `enabled` field is unaffected so
   * disabled-state styling remains observable.
   */
  forceVisible?: boolean
}

export function evaluateConditional(
  conditional: ConditionalDefinition | undefined,
  formData: Record<string, unknown>,
  instanceData: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
  options: EvaluateConditionalOptions = {},
): ConditionalState {
  if (!conditional) return { visible: true, enabled: true }

  const merged = { ...params, ...instanceData, ...formData }

  let visible = true
  let enabled = true

  if (conditional.showIf) {
    visible = evaluateRule(conditional.showIf, merged)
  }

  if (conditional.hideIf) {
    visible = !evaluateRule(conditional.hideIf, merged)
  }

  if (conditional.enableIf) {
    enabled = evaluateRule(conditional.enableIf, merged)
  }

  if (conditional.disableIf) {
    enabled = !evaluateRule(conditional.disableIf, merged)
  }

  if (options.forceVisible) visible = true

  return { visible, enabled }
}

function evaluateRule(rule: ConditionRule, data: Record<string, unknown>): boolean {
  if (rule.allOf) {
    return rule.allOf.every(r => evaluateRule(r, data))
  }
  if (rule.anyOf) {
    return rule.anyOf.some(r => evaluateRule(r, data))
  }
  if (rule.not) {
    return !evaluateRule(rule.not, data)
  }

  if (!rule.field) return true

  const fieldValue = getNestedValue(data, rule.field)
  const operator = rule.operator || 'equals'

  switch (operator) {
    case 'equals':
      return fieldValue === rule.value
    case 'notEquals':
      return fieldValue !== rule.value
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(fieldValue)
    case 'notIn':
      return Array.isArray(rule.value) && !rule.value.includes(fieldValue)
    case 'greaterThan':
      return Number(fieldValue) > Number(rule.value)
    case 'lessThan':
      return Number(fieldValue) < Number(rule.value)
    case 'greaterThanOrEquals':
      return Number(fieldValue) >= Number(rule.value)
    case 'lessThanOrEquals':
      return Number(fieldValue) <= Number(rule.value)
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(rule.value))
    case 'startsWith':
      return typeof fieldValue === 'string' && fieldValue.startsWith(String(rule.value))
    case 'endsWith':
      return typeof fieldValue === 'string' && fieldValue.endsWith(String(rule.value))
    case 'isEmpty':
      return fieldValue === undefined || fieldValue === null || fieldValue === ''
    case 'isNotEmpty':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
    default:
      return true
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string | undefined): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined
    return (curr as Record<string, unknown>)[key]
  }, obj)
}
