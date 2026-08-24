import type { FlowStateCodec } from './flow-state'
import type { AuthenticationOutcome, AuthenticationProvider } from './provider'
import type { AuthRequestContext } from './request-context'
import { startMagicAuth } from './recovery-service'
import { safeReturnPath } from './return-path'
export async function passwordAuthentication(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  context: AuthRequestContext
  email: string
  password: string
  returnTo?: string | undefined
  signalsId?: string | undefined
}) {
  const credentials = {
    ...input.context,
    email: input.email,
    password: input.password,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  }
  const outcome = await input.provider.authenticateWithPassword(credentials)
  return routeAuthenticationOutcome({
    provider: input.provider,
    flow: input.flow,
    outcome,
    email: input.email,
    returnTo: input.returnTo,
  })
}

export async function signUpWithEmailCode(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  context: AuthRequestContext
  email: string
  password: string
  returnTo?: string | undefined
  signalsId?: string | undefined
}) {
  const authInput = {
    ...input.context,
    email: input.email,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  }
  try {
    await input.provider.signUp({ ...authInput, password: input.password })
  } catch {
    // New and existing accounts must have the same public continuation.
  }
  const flow = await startMagicAuth({
    email: input.email,
    returnTo: safeReturnPath(input.returnTo),
    flow: input.flow,
    start: (email) => input.provider.sendMagicAuthCode({ ...authInput, email }),
  })
  return { destination: '/magic-auth?code=1' as const, flow }
}

export async function routeAuthenticationOutcome(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  outcome: AuthenticationOutcome
  email: string
  returnTo?: string | undefined
}) {
  const returnTo = safeReturnPath(input.returnTo)
  const expiresAt = Date.now() + 600_000
  const outcome = input.outcome
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
    const email = outcome.email ?? input.email
    const connectionIds = outcome.connectionIds ?? []
    const connectionId =
      connectionIds.length === 1
        ? connectionIds[0]
        : (await input.provider.resolveSsoConnection(email))?.connectionId
    if (!connectionId)
      return { outcome: { status: 'blocked' as const }, returnTo }
    return {
      outcome: { status: 'sso-required' as const },
      flow: await input.flow.seal({
        kind: 'sso',
        connectionId,
        ...(email ? { email } : {}),
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
  const flow = await input.flow.unseal(input.flowValue, 'email-verification')
  return input.provider.verifyEmail({
    ...input.context,
    code: input.code,
    pendingAuthenticationToken: flow.pendingAuthenticationToken,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  })
}
