import { AuthenticationException } from '@workos-inc/node'
import type { AuthenticationOutcome } from './provider'

export type PublicAuthError = {
  code: 'invalid_credentials' | 'validation_error' | 'service_unavailable'
  message: string
  fields?: Record<string, string>
  cause?: string
}

export function transitionFromError(
  error: unknown,
):
  | Exclude<AuthenticationOutcome, { status: 'authenticated' | 'blocked' }>
  | undefined {
  if (!(error instanceof AuthenticationException)) return undefined
  const { rawData, pendingAuthenticationToken: token } = error
  if (error.code === 'email_verification_required' && token)
    return {
      status: 'email-verification-required',
      pendingAuthenticationToken: token,
    }
  if (error.code === 'mfa_enrollment' && token && rawData.user)
    return {
      status: 'mfa-enrollment-required',
      pendingAuthenticationToken: token,
      user: { id: rawData.user.id, email: rawData.user.email },
    }
  if (
    (error.code === 'mfa_challenge' || error.code === 'mfa_verification') &&
    token
  )
    return {
      status: 'mfa-required',
      pendingAuthenticationToken: token,
      factors: [],
    }
  if (
    (error.code === 'radar_email_challenge' ||
      error.code === 'radar_sms_challenge') &&
    token &&
    error.radarChallengeId
  )
    return {
      status: 'radar-challenge',
      pendingAuthenticationToken: token,
      challenge: {
        type: error.code === 'radar_sms_challenge' ? 'sms' : 'email',
        challengeId: error.radarChallengeId,
        ...(rawData.user
          ? { user: { id: rawData.user.id, email: rawData.user.email } }
          : {}),
      },
    }
  if (error.code === 'organization_selection_required' && token)
    return {
      status: 'organization-selection-required',
      pendingAuthenticationToken: token,
      organizations: rawData.organizations ?? [],
    }
  if (error.code === 'sso_required')
    return {
      status: 'sso-required',
      connectionIds: rawData.connection_ids ?? [],
    }
  return undefined
}
export function publicAuthError(error: unknown): PublicAuthError {
  if (
    error instanceof Error &&
    /invalid|password|not found/i.test(error.message)
  )
    return {
      code: 'invalid_credentials',
      message: 'Unable to sign in with those credentials.',
    }
  if (error instanceof Error && /validation/i.test(error.message))
    return {
      code: 'validation_error',
      message: 'Please correct the highlighted fields.',
    }
  return {
    code: 'service_unavailable',
    message: 'Authentication is temporarily unavailable. Please try again.',
    cause: error instanceof Error ? error.name : 'unknown',
  }
}
