import type { FlowStateCodec } from './flow-state'
import type { AuthenticationProvider } from './provider'
import type { AuthRequestContext } from './request-context'
import { safeReturnPath } from './return-path'
export async function passwordAuthentication(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  context: AuthRequestContext
  email: string
  password: string
  returnTo?: string | undefined
  signalsId?: string | undefined
  signUp?: boolean
}) {
  const credentials = {
    ...input.context,
    email: input.email,
    password: input.password,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  }
  const outcome = await (input.signUp
    ? input.provider.signUp(credentials)
    : input.provider.authenticateWithPassword(credentials))
  const returnTo = safeReturnPath(input.returnTo)
  const expiresAt = Date.now() + 600_000
  if (outcome.status === 'email-verification-required')
    return {
      outcome,
      flow: await input.flow.seal({
        kind: 'email-verification',
        pendingAuthenticationToken: outcome.pendingAuthenticationToken,
        returnTo,
        expiresAt,
      }),
    }
  if (outcome.status === 'mfa-enrollment-required')
    return {
      outcome,
      flow: await input.flow.seal({
        kind: 'mfa-enrollment',
        pendingAuthenticationToken: outcome.pendingAuthenticationToken,
        userId: outcome.user.id,
        email: outcome.user.email,
        returnTo,
        expiresAt,
      }),
    }
  if (outcome.status === 'mfa-required')
    return {
      outcome,
      flow: await input.flow.seal({
        kind: 'mfa',
        pendingAuthenticationToken: outcome.pendingAuthenticationToken,
        factors: outcome.factors,
        returnTo,
        expiresAt,
      }),
    }
  if (outcome.status === 'radar-challenge') {
    if (outcome.challenge.type === 'sms')
      return {
        outcome,
        flow: await input.flow.seal({
          kind: 'radar-sms',
          pendingAuthenticationToken: outcome.pendingAuthenticationToken,
          userId: outcome.challenge.user.id,
          returnTo,
          expiresAt,
        }),
      }
    return {
      outcome,
      flow: await input.flow.seal({
        kind: 'radar-email',
        pendingAuthenticationToken: outcome.pendingAuthenticationToken,
        challengeId: outcome.challenge.challengeId,
        returnTo,
        expiresAt,
      }),
    }
  }
  if (outcome.status === 'organization-selection-required')
    return {
      outcome,
      flow: await input.flow.seal({
        kind: 'organization-selection',
        pendingAuthenticationToken: outcome.pendingAuthenticationToken,
        organizations: outcome.organizations,
        returnTo,
        expiresAt,
      }),
    }
  if (outcome.status === 'sso-required') {
    const connection = await input.provider.resolveSsoConnection(input.email)
    if (!connection)
      return { outcome: { status: 'blocked' as const }, returnTo }
    return {
      outcome: { status: 'sso-required' as const },
      flow: await input.flow.seal({
        kind: 'sso',
        connectionId: connection.connectionId,
        email: input.email,
        returnTo,
        expiresAt,
      }),
    }
  }
  return { outcome, returnTo }
}
export async function verifyPasswordEmail(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  code: string
  context: AuthRequestContext
  signalsId?: string | undefined
}) {
  const flow = (await input.flow.unseal(
    input.flowValue,
    'email-verification',
  )) as Extract<
    Awaited<ReturnType<FlowStateCodec['unseal']>>,
    { kind: 'email-verification' }
  >
  return input.provider.verifyEmail({
    ...input.context,
    code: input.code,
    pendingAuthenticationToken: flow.pendingAuthenticationToken,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  })
}
