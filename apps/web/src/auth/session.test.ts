/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest'
import { authenticateWebSession } from './session'
const config = {
  mode: 'workos' as const,
  apiKey: 'sk',
  clientId: 'client',
  cookiePassword: 'x'.repeat(32),
  redirectUri: 'https://app.test/auth/callback',
  sessionCookieName: 'session',
  flowCookieName: 'flow',
  socialProviders: [],
  radarMode: 'off' as const,
}
describe('authenticateWebSession', () => {
  it('uses a current token or rotates the sealed session after refresh', async () => {
    const provider: any = {
      loadSession: async () => ({
        authenticate: async () => ({ authenticated: false }),
        refresh: async () => ({
          authenticated: true,
          sealedSession: 'rotated',
          accessToken: 'access',
          user: { id: 'u', email: 'u@test' },
        }),
      }),
    }
    await expect(
      authenticateWebSession({ config, sealedSession: 'sealed', provider }),
    ).resolves.toMatchObject({
      authenticated: true,
      replacementCookie: 'rotated',
      accessToken: 'access',
    })
  })
  it('clears invalid sealed sessions and keeps local mode credential-free', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'bad',
        provider: {
          loadSession: async () => {
            throw new Error('bad')
          },
        } as any,
      }),
    ).resolves.toEqual({ authenticated: false, clearCookie: true })
    await expect(
      authenticateWebSession({
        config: { mode: 'local', sessionCookieName: 'session' },
      }),
    ).resolves.toEqual({ authenticated: false, clearCookie: false })
  })

  it('preserves the sealed cookie for retryable refresh failures', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'sealed',
        provider: {
          loadSession: async () => ({
            authenticate: async () => ({ authenticated: false }),
            refresh: async () => ({
              authenticated: false,
              retryable: true,
              reason: 'network_error',
            }),
          }),
        } as any,
      }),
    ).resolves.toEqual({
      authenticated: false,
      clearCookie: false,
      retryable: true,
    })
  })

  it('clears the sealed cookie for terminal refresh failures', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'sealed',
        provider: {
          loadSession: async () => ({
            authenticate: async () => ({ authenticated: false }),
            refresh: async () => ({
              authenticated: false,
              retryable: false,
              reason: 'invalid_refresh_token',
            }),
          }),
        } as any,
      }),
    ).resolves.toEqual({ authenticated: false, clearCookie: true })
  })
})
