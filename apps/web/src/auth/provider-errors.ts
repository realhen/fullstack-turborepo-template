import { AuthenticationException } from '@workos-inc/node'
import { z } from 'zod'
import type { AuthenticationOutcome } from './provider'

export type PublicAuthError = {
  code: 'invalid_credentials' | 'validation_error' | 'service_unavailable'
  message: string
  fields?: Record<string, string>
  cause?: string
}
const factor = z.object({ id: z.string().min(1), type: z.literal('totp') })
const factors = z.array(z.unknown()).transform((value) =>
  value.flatMap((item) => {
    const parsed = factor.safeParse(item)
    return parsed.success ? [parsed.data] : []
  }),
)
const ssoData = z.object({
  user: z.object({ email: z.string().email() }).optional(),
  email: z.string().email().optional(),
  connection_ids: z.array(z.string().min(1)).optional(),
  connectionIds: z.array(z.string().min(1)).optional(),
})

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
      factors: factors.safeParse(rawData.authentication_factors).data ?? [],
    }
  if (error.code === 'radar_email_challenge' && token && error.radarChallengeId)
    return {
      status: 'radar-challenge',
      pendingAuthenticationToken: token,
      challenge: {
        type: 'email',
        challengeId: error.radarChallengeId,
        ...(rawData.user
          ? { user: { id: rawData.user.id, email: rawData.user.email } }
          : {}),
      },
    }
  if (error.code === 'radar_sms_challenge' && token && rawData.user)
    return {
      status: 'radar-challenge',
      pendingAuthenticationToken: token,
      challenge: {
        type: 'sms',
        user: { id: rawData.user.id, email: rawData.user.email },
      },
    }
  if (error.code === 'organization_selection_required' && token)
    return {
      status: 'organization-selection-required',
      pendingAuthenticationToken: token,
      organizations: rawData.organizations ?? [],
    }
  if (error.code === 'sso_required') {
    const data = ssoData.safeParse(rawData)
    if (!data.success) return { status: 'sso-required' }
    const connectionIds = data.data.connection_ids ?? data.data.connectionIds
    const email = data.data.user?.email ?? data.data.email
    return {
      status: 'sso-required',
      ...(email ? { email } : {}),
      ...(connectionIds ? { connectionIds } : {}),
    }
  }
  return undefined
}
export function publicAuthError(error: unknown): PublicAuthError {
  return {
    code: 'service_unavailable',
    message: 'Authentication is temporarily unavailable. Please try again.',
    cause: error instanceof Error ? error.name : 'unknown',
  }
}
