import { describe, expect, it } from 'vitest'
import { actionStateFromError } from './action-state'
describe('action state', () => {
  it('keeps credential and unknown failures safe', () => {
    expect(actionStateFromError(new Error('invalid password'))).toMatchObject({
      code: 'invalid_credentials',
    })
    expect(actionStateFromError(new Error('provider exploded'))).toMatchObject({
      code: 'service_unavailable',
    })
  })
  it('maps verification mistakes without exposing provider details', () => {
    expect(
      actionStateFromError(new Error('invalid verification code')),
    ).toEqual({
      code: 'invalid_code',
      message: 'Unable to verify that code. Try again.',
    })
  })
})
