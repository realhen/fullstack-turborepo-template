import type { FlowStateCodec } from './flow-state'
import { routeAuthenticationOutcome } from './password-service'
import type { AuthenticationProvider } from './provider'
import type { AuthRequestContext } from './request-context'

export async function startRecovery(input: {
  email: string
  start(email: string): Promise<void>
}) {
  try {
    await input.start(input.email)
  } catch {
    /* recovery intentionally does not enumerate */
  }
  return { message: 'If an account exists, a recovery email has been sent.' }
}
export async function startMagicAuth(input: {
  email: string
  returnTo: string
  flow: FlowStateCodec
  start: (email: string) => Promise<{ radarAuthAttemptId?: string }>
}) {
  const result = await input.start(input.email)
  return input.flow.seal({
    kind: 'magic-auth',
    email: input.email,
    ...(result.radarAuthAttemptId
      ? { radarAuthAttemptId: result.radarAuthAttemptId }
      : {}),
    returnTo: input.returnTo,
    expiresAt: Date.now() + 600_000,
  })
}

export async function completeMagicAuth(input: {
  provider: AuthenticationProvider
  flow: FlowStateCodec
  flowValue: string
  code: string
  context: AuthRequestContext
  signalsId?: string
}) {
  const state = await input.flow.unseal(input.flowValue, 'magic-auth')
  const outcome = await input.provider.authenticateWithMagicAuth({
    ...input.context,
    email: state.email,
    code: input.code,
    ...(state.radarAuthAttemptId
      ? { radarAuthAttemptId: state.radarAuthAttemptId }
      : {}),
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
  })
  return routeAuthenticationOutcome({
    provider: input.provider,
    flow: input.flow,
    outcome,
    email: state.email,
    returnTo: state.returnTo,
  })
}
