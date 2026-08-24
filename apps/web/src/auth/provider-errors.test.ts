import { AuthenticationException } from '@workos-inc/node'
import { describe, expect, it } from 'vitest'
import { transitionFromError, publicAuthError } from './provider-errors'

describe('provider errors', () => {
  it('maps WorkOS transitions without exposing them as public errors', () => {
    const error = new AuthenticationException(
      401,
      {
        code: 'mfa_enrollment',
        pending_authentication_token: 'pending',
        user: { id: 'user', email: 'user@example.com' },
      } as never,
      'req',
    )
    expect(transitionFromError(error)).toEqual({
      status: 'mfa-enrollment-required',
      pendingAuthenticationToken: 'pending',
      user: { id: 'user', email: 'user@example.com' },
    })
  })
  it.each([
    [
      'email_verification_required',
      { pending_authentication_token: 'pending' },
      'email-verification-required',
    ],
    [
      'mfa_challenge',
      { pending_authentication_token: 'pending' },
      'mfa-required',
    ],
    [
      'mfa_verification',
      { pending_authentication_token: 'pending' },
      'mfa-required',
    ],
    [
      'radar_email_challenge',
      {
        pending_authentication_token: 'pending',
        radar_challenge_id: 'challenge',
      },
      'radar-challenge',
    ],
    [
      'radar_sms_challenge',
      {
        pending_authentication_token: 'pending',
        radar_challenge_id: 'challenge',
        user: { id: 'user', email: 'user@example.com' },
      },
      'radar-challenge',
    ],
    [
      'organization_selection_required',
      {
        pending_authentication_token: 'pending',
        organizations: [{ id: 'org', name: 'Organization' }],
      },
      'organization-selection-required',
    ],
    [
      'sso_required',
      {
        error: 'sso_required',
        error_description: 'SSO required',
        connection_ids: ['conn'],
      },
      'sso-required',
    ],
  ] as const)('maps %s', (code, rawData, status) => {
    const error = new AuthenticationException(
      401,
      { code, ...rawData } as never,
      'req',
    )
    expect(transitionFromError(error)).toMatchObject({ status })
  })
  it('keeps ordinary credential failures generic', () => {
    expect(publicAuthError(new Error('invalid password'))).toEqual({
      code: 'invalid_credentials',
      message: 'Unable to sign in with those credentials.',
    })
  })
})
