import { describe, expect, it } from 'vitest'
import { createFlowStateCodec } from './flow-state'
import {
  createOAuthFlow,
  consumeOAuthCallback,
  socialProvider,
} from './oauth-service'

const flow = createFlowStateCodec('x'.repeat(32), () => 1)

describe('OAuth orchestration', () => {
  it('accepts only configured social providers', () => {
    expect(socialProvider('GoogleOAuth', ['GoogleOAuth'])).toBe('GoogleOAuth')
    expect(() => socialProvider('connection_123', ['GoogleOAuth'])).toThrow(
      'provider',
    )
  })

  it('seals a random PKCE callback flow without plaintext state', async () => {
    const result = await createOAuthFlow({
      flow,
      returnTo: '/app/members',
      signalsId: 'opaque-signals',
      random: () => 'a'.repeat(64),
    })

    expect(result.value).not.toContain('opaque-signals')
    await expect(flow.unseal(result.value, 'oauth')).resolves.toMatchObject({
      state: 'a'.repeat(64),
      codeVerifier: 'a'.repeat(64),
      returnTo: '/app/members',
    })
  })

  it('requires exact state and consumes callback data once', async () => {
    const created = await createOAuthFlow({
      flow,
      returnTo: '/app',
      random: () => 'random-value',
    })

    await expect(
      consumeOAuthCallback({
        flow,
        value: created.value,
        state: 'different',
        code: 'code',
      }),
    ).rejects.toThrow('invalid')
    await expect(
      consumeOAuthCallback({
        flow,
        value: created.value,
        state: created.state,
        code: 'code',
      }),
    ).resolves.toMatchObject({ code: 'code', consumed: true, returnTo: '/app' })
  })

  it('cleans up provider callback errors without returning provider details', async () => {
    const created = await createOAuthFlow({
      flow,
      returnTo: '/app',
      random: () => 'random-value',
    })

    await expect(
      consumeOAuthCallback({
        flow,
        value: created.value,
        state: created.state,
        error: 'access_denied',
      }),
    ).resolves.toEqual({ consumed: true, error: true, returnTo: '/app' })
  })
})
