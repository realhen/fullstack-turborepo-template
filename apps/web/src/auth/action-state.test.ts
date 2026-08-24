import { describe, expect, it } from 'vitest'
import { actionStateFromError } from './action-state'
describe('action state', () => {
  it('does not classify account-sensitive provider messages', () => {
    expect(actionStateFromError(new Error('invalid password'))).toMatchObject({
      code: 'service_unavailable',
    })
    expect(
      actionStateFromError(new Error('email already exists')),
    ).toMatchObject({
      code: 'service_unavailable',
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
