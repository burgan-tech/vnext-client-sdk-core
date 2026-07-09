/**
 * Public registry of the action verbs the SDK reserves for itself.
 *
 * Everything outside this list is **opaque** to the SDK and is
 * dispatched as-is to the host `delegate.onAction(action, formData,
 * command)`. Domain action vocabularies (workflow transitions,
 * navigation routes, integration calls) belong to the host — they
 * should not be added here.
 *
 * Used by:
 *  - View designers / builders to populate an "action verb" picker
 *  - Hosts to switch on incoming actions safely
 *  - Documentation / AI authoring guides
 */

export type ReservedAction = 'submit' | 'select' | 'reset'

export interface ActionSpec {
  /** Short human-readable label (for builder palettes). */
  label: string
  /** What the SDK does internally when it sees this action. */
  sdkBehavior: string
  /** Whether SDK runs `validateAllFields()` by default. May be overridden by `validate` on the descriptor. */
  defaultValidate: boolean
  /** Whether the host `delegate.onAction` is still invoked after SDK handling. */
  reachesHost: boolean
  /** Field names required on the descriptor for this action to be valid. */
  requiredFields?: string[]
}

export const STANDARD_ACTIONS: Record<ReservedAction, ActionSpec> = {
  submit: {
    label: 'Submit',
    sdkBehavior: 'Runs validateAllFields(); if any field has an error, dispatch is blocked and the host is not called.',
    defaultValidate: true,
    reachesHost: true,
  },
  select: {
    label: 'Select value',
    sdkBehavior:
      'Sets formData[bind]/uiState[bind] = value. Handled entirely inside the SDK; host delegate is NOT called. ' +
      'Action `preHooks` / `postHooks` are also skipped because no host dispatch happens — author hooks on a sibling dispatch action instead.',
    defaultValidate: false,
    reachesHost: false,
    requiredFields: ['bind', 'value'],
  },
  reset: {
    label: 'Reset form',
    sdkBehavior: 'Clears ctx.formData and ctx.errors. After clearing, the host delegate IS called (so the host can refresh remote state if needed).',
    defaultValidate: false,
    reachesHost: true,
  },
}

/**
 * Returns true when the action verb is reserved by the SDK and has
 * built-in behaviour. Anything else is a host-domain dispatch.
 */
export function isReservedAction(verb: string): verb is ReservedAction {
  return verb === 'submit' || verb === 'select' || verb === 'reset'
}

/**
 * Resolves the effective `validate` flag for an action, applying
 * the descriptor override on top of the verb's default.
 */
export function shouldValidateAction(
  action: string | { action: string; validate?: boolean },
): boolean {
  if (typeof action === 'string') return action === 'submit'
  return action.validate ?? action.action === 'submit'
}
