import { randomBytes } from 'node:crypto'
import type { FlowStateCodec } from './flow-state'
import type { SocialProvider } from './config'
import { safeReturnPath } from './return-path'

export function socialProvider(
  value: string,
  configured: readonly SocialProvider[],
): SocialProvider {
  if (!configured.includes(value as SocialProvider))
    throw new Error('The selected social provider is invalid')
  return value as SocialProvider
}

export async function createOAuthFlow(input: {
  flow: FlowStateCodec
  returnTo?: string
  signalsId?: string
  random?: () => string
}) {
  const random = input.random ?? (() => randomBytes(48).toString('base64url'))
  const state = random()
  const codeVerifier = random()
  const value = await input.flow.seal({
    kind: 'oauth',
    state,
    codeVerifier,
    ...(input.signalsId ? { signalsId: input.signalsId } : {}),
    returnTo: safeReturnPath(input.returnTo),
    expiresAt: Date.now() + 600_000,
  })
  return { state, codeVerifier, value }
}

export async function consumeOAuthCallback(input: {
  flow: FlowStateCodec
  value: string
  state: string | null
  code?: string | null
  error?: string | null
}) {
  const stored = await input.flow.unseal(input.value, 'oauth')
  if (!input.state || input.state !== stored.state)
    throw new Error('OAuth callback state is invalid')
  if (input.error)
    return {
      consumed: true as const,
      error: true as const,
      returnTo: stored.returnTo,
    }
  if (!input.code) throw new Error('OAuth callback is invalid')
  return {
    consumed: true as const,
    code: input.code,
    codeVerifier: stored.codeVerifier,
    ...(stored.signalsId ? { signalsId: stored.signalsId } : {}),
    returnTo: stored.returnTo,
  }
}
