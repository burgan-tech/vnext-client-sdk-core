import { reactive, provide, inject, type InjectionKey } from 'vue'
import type { DataSchema, FormContext } from '../../engine/types'

const FORM_CONTEXT_KEY: InjectionKey<FormContext> = Symbol('FormContext')

export interface CreateFormContextOptions {
  designerMode?: boolean
}

export function createFormContext(
  schema: DataSchema,
  lang: string = 'tr',
  options: CreateFormContextOptions = {},
): FormContext {
  const ctx = reactive<FormContext>({
    schema,
    formData: buildInitialData(schema),
    instanceData: {},
    params: {},
    uiState: {},
    lovData: {},
    lookupData: {},
    lang,
    errors: {},
    designerMode: options.designerMode,
  })

  return ctx
}

export function provideFormContext(ctx: FormContext) {
  provide(FORM_CONTEXT_KEY, ctx)
}

export function useFormContext(): FormContext {
  const ctx = inject(FORM_CONTEXT_KEY)
  if (!ctx) throw new Error('FormContext not provided. Wrap your component tree with a FormContext provider.')
  return ctx
}

function buildInitialData(schema: DataSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (!schema.properties) return data

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.default !== undefined) {
      data[key] = prop.default
    }
  }

  return data
}

