import type { FormContext, NestedComponentNode } from './types'
import { resolveExpression } from './expressionResolver'

export interface BindResult {
  form: Record<string, unknown>
  instance: Record<string, unknown>
}

/**
 * Resolves a nested component's bind definition against the parent context.
 * Returns { form, instance } to pass to the child as boundValues/boundInstanceValues.
 */
export function resolveNestedBind(
  bind: NestedComponentNode['bind'],
  ctx: FormContext
): BindResult | undefined {
  if (!bind) return undefined

  if (typeof bind === 'string') {
    if (!bind.startsWith('$')) return undefined
    const resolved = resolveExpression(bind, ctx)
    if (!resolved || typeof resolved !== 'object') return undefined
    const data = resolved as Record<string, unknown>
    if (bind.startsWith('$instance')) {
      return { form: {}, instance: { ...data } }
    }
    return { form: { ...data }, instance: {} }
  }

  const formResult: Record<string, unknown> = {}
  const instanceResult: Record<string, unknown> = {}

  for (const [childField, parentExpr] of Object.entries(bind)) {
    if (parentExpr.startsWith('$instance.')) {
      instanceResult[childField] = getByPath(ctx.instanceData, parentExpr.slice(10).split('.'))
    } else if (parentExpr.startsWith('$ui.')) {
      formResult[childField] = getByPath(ctx.uiState, parentExpr.slice(4).split('.'))
    } else if (parentExpr.startsWith('$form.')) {
      formResult[childField] = getByPath(ctx.formData, parentExpr.slice(6).split('.'))
    } else {
      formResult[childField] = getByPath(ctx.formData, parentExpr.split('.'))
    }
  }

  return { form: formResult, instance: instanceResult }
}

/**
 * Applies child component's emitted data back to the parent context.
 * Used when nested component emits 'update' with its formData.
 */
export function applyNestedUpdate(
  bind: NestedComponentNode['bind'],
  childData: Record<string, unknown>,
  ctx: Pick<FormContext, 'formData' | 'instanceData' | 'uiState'>
): void {
  if (!bind) return

  if (typeof bind === 'string') {
    ctx.formData[bind] = childData
    return
  }

  for (const [childField, parentExpr] of Object.entries(bind)) {
    const value = childData[childField]
    if (parentExpr.startsWith('$instance.')) {
      setByPath(ctx.instanceData, parentExpr.slice(10).split('.'), value)
    } else if (parentExpr.startsWith('$ui.')) {
      setByPath(ctx.uiState, parentExpr.slice(4).split('.'), value)
    } else if (parentExpr.startsWith('$form.')) {
      setByPath(ctx.formData, parentExpr.slice(6).split('.'), value)
    } else {
      setByPath(ctx.formData, parentExpr.split('.'), value)
    }
  }
}

export function getByPath(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setByPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    const existingVal = current[key]
    if (existingVal == null || typeof existingVal !== 'object') {
      const nextKey = path[i + 1]
      current[key] = (nextKey !== undefined && /^\d+$/.test(nextKey)) ? [] : {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[path[path.length - 1]!] = value
}
