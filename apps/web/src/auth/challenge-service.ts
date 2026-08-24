import type { AuthFlowState, FlowStateCodec } from './flow-state'
import { routeAuthenticationOutcome } from './password-service'
import type { AuthenticationProvider } from './provider'
import type { AuthRequestContext } from './request-context'

type FlowOf<K extends AuthFlowState['kind']> = Extract<
  AuthFlowState,
  { kind: K }
>

async function readFlow<K extends AuthFlowState['kind']>(
  codec: FlowStateCodec,
  value: string,
  kind: K,
): Promise<FlowOf<K>> {
  return codec.unseal(value, kind)
}

const expiry = () => Date.now() + 600_000

export function normalizeE164(value: string) {
  const normalized = value.replace(/[\s()-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : undefined
}

export async function startTotpEnrollment(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  context: AuthRequestContext
}) {
  const state = await readFlow(input.flow, input.flowValue, 'mfa-enrollment')
  const enrolled = await input.provider.enrollTotp({
    ...input.context,
    userId: state.userId,
  })
  return {
    secret: enrolled.secret,
    uri: enrolled.uri,
    flow: await input.flow.seal({
      ...state,
      challengeId: enrolled.challengeId,
      secret: enrolled.secret,
      uri: enrolled.uri,
    }),
  }
}

export async function startTotpChallenge(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  factorId: string
}) {
  const state = await readFlow(input.flow, input.flowValue, 'mfa')
  if (!state.factors.some((factor) => factor.id === input.factorId))
    throw new Error('The selected authentication factor is invalid')
  const challenge = await input.provider.startTotpChallenge({
    factorId: input.factorId,
  })
  return input.flow.seal({ ...state, challengeId: challenge.challengeId })
}

export async function completeTotpChallenge(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  code: string
  context: AuthRequestContext
}) {
  const state = await input.flow.unseal(input.flowValue)
  if (state.kind !== 'mfa' && state.kind !== 'mfa-enrollment')
    throw new Error('The authentication challenge is invalid')
  if (!state.challengeId)
    throw new Error('Start the authentication challenge first')
  const outcome = await input.provider.authenticateTotp({
    ...input.context,
    code: input.code,
    challengeId: state.challengeId,
    pendingAuthenticationToken: state.pendingAuthenticationToken,
  })
  return routeAuthenticationOutcome({
    provider: input.provider,
    flow: input.flow,
    outcome,
    email: state.kind === 'mfa-enrollment' ? state.email : '',
    returnTo: state.returnTo,
  })
}

export async function selectOrganization(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  organizationId: string
  context: AuthRequestContext
}) {
  const state = await readFlow(
    input.flow,
    input.flowValue,
    'organization-selection',
  )
  if (
    !state.organizations.some(
      (organization) => organization.id === input.organizationId,
    )
  )
    throw new Error('The selected organization is invalid')
  const outcome = await input.provider.authenticateWithOrganizationSelection({
    ...input.context,
    organizationId: input.organizationId,
    pendingAuthenticationToken: state.pendingAuthenticationToken,
  })
  return routeAuthenticationOutcome({
    provider: input.provider,
    flow: input.flow,
    outcome,
    email: '',
    returnTo: state.returnTo,
  })
}

export async function startRadarSmsChallenge(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  phoneNumber: string
  context: AuthRequestContext
}) {
  const state = await readFlow(input.flow, input.flowValue, 'radar-sms')
  const phoneNumber = normalizeE164(input.phoneNumber)
  if (!phoneNumber) throw new Error('Enter a valid phone number')
  const challenge = await input.provider.startRadarChallenge({
    ...input.context,
    userId: state.userId,
    pendingAuthenticationToken: state.pendingAuthenticationToken,
    phoneNumber,
  })
  return input.flow.seal({
    ...state,
    verificationId: challenge.verificationId,
    phoneNumber: challenge.phoneNumber,
    expiresAt: expiry(),
  })
}

export async function completeRadarChallenge(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  code: string
  context: AuthRequestContext
}) {
  const state = await input.flow.unseal(input.flowValue)
  if (state.kind !== 'radar-email' && state.kind !== 'radar-sms')
    throw new Error('The authentication challenge is invalid')
  if (
    state.kind === 'radar-sms' &&
    (!state.verificationId || !state.phoneNumber)
  )
    throw new Error('Start the SMS challenge first')
  const outcome = await input.provider.completeRadarChallenge({
    ...input.context,
    code: input.code,
    type: state.kind === 'radar-email' ? 'email' : 'sms',
    pendingAuthenticationToken: state.pendingAuthenticationToken,
    ...(state.kind === 'radar-email' ? { challengeId: state.challengeId } : {}),
    ...(state.kind === 'radar-sms'
      ? { verificationId: state.verificationId, phoneNumber: state.phoneNumber }
      : {}),
  })
  return routeAuthenticationOutcome({
    provider: input.provider,
    flow: input.flow,
    outcome,
    email: '',
    returnTo: state.returnTo,
  })
}
