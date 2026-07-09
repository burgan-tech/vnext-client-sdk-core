import { describe, it, expect } from 'vitest'
import { STANDARD_ACTIONS, isReservedAction, shouldValidateAction } from '../../src/engine/actionVocabulary'

describe('STANDARD_ACTIONS', () => {
  it('exposes exactly the three reserved verbs', () => {
    expect(Object.keys(STANDARD_ACTIONS).sort()).toEqual(['reset', 'select', 'submit'])
  })

  it('marks submit as validating by default', () => {
    expect(STANDARD_ACTIONS.submit.defaultValidate).toBe(true)
    expect(STANDARD_ACTIONS.submit.reachesHost).toBe(true)
  })

  it('marks select as SDK-internal (host not called)', () => {
    expect(STANDARD_ACTIONS.select.reachesHost).toBe(false)
    expect(STANDARD_ACTIONS.select.requiredFields).toContain('bind')
    expect(STANDARD_ACTIONS.select.requiredFields).toContain('value')
  })

  it('marks reset as no-validate but reaches host', () => {
    expect(STANDARD_ACTIONS.reset.defaultValidate).toBe(false)
    expect(STANDARD_ACTIONS.reset.reachesHost).toBe(true)
  })
})

describe('isReservedAction', () => {
  it('returns true for the three reserved verbs', () => {
    expect(isReservedAction('submit')).toBe(true)
    expect(isReservedAction('select')).toBe(true)
    expect(isReservedAction('reset')).toBe(true)
  })

  it('returns false for domain dispatches', () => {
    expect(isReservedAction('transition')).toBe(false)
    expect(isReservedAction('urn:amorphie:wf:next')).toBe(false)
    expect(isReservedAction('navigate')).toBe(false)
  })
})

describe('shouldValidateAction', () => {
  it('returns true for "submit" string', () => {
    expect(shouldValidateAction('submit')).toBe(true)
  })

  it('returns false for any other string verb', () => {
    expect(shouldValidateAction('reset')).toBe(false)
    expect(shouldValidateAction('dispatch')).toBe(false)
    expect(shouldValidateAction('urn:amorphie:wf:next')).toBe(false)
  })

  it('returns true for submit descriptor by default', () => {
    expect(shouldValidateAction({ action: 'submit' })).toBe(true)
  })

  it('respects explicit validate:false on submit (escape hatch)', () => {
    expect(shouldValidateAction({ action: 'submit', validate: false })).toBe(false)
  })

  it('returns true for dispatch + validate:true (transition-like)', () => {
    expect(shouldValidateAction({ action: 'dispatch', validate: true })).toBe(true)
    expect(shouldValidateAction({ action: 'urn:amorphie:wf:next', validate: true })).toBe(true)
  })

  it('returns false for unknown verbs without explicit flag', () => {
    expect(shouldValidateAction({ action: 'transition' })).toBe(false)
  })
})
