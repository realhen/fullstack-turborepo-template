/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest'
import { getCurrentUser } from './current-user'

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

describe('getCurrentUser', () => {
  it('projects only display fields from an authenticated WorkOS session', async () => {
    await expect(
      getCurrentUser({
        config,
        provider: {
          loadSession: async () => ({
            authenticate: async () => ({
              authenticated: true,
              accessToken: 'secret-access-token',
              user: {
                id: 'user-id',
                email: 'ada@example.com',
                firstName: 'Ada',
                lastName: 'Lovelace',
              },
            }),
            refresh: async () => ({ authenticated: false }),
            logoutUrl: async () => 'https://auth.test/logout',
          }),
        },
        sealedSession: 'sealed',
      }),
    ).resolves.toEqual({ email: 'ada@example.com', name: 'Ada Lovelace' })
  })

  it('returns the local template display when local auth is selected', async () => {
    await expect(
      getCurrentUser({
        config: { mode: 'local', sessionCookieName: 'session' },
      }),
    ).resolves.toEqual(null)
  })

  it('does not expose a user when the sealed session is invalid', async () => {
    await expect(
      getCurrentUser({
        config,
        provider: {
          loadSession: async () => {
            throw new Error('expired')
          },
        },
        sealedSession: 'expired',
      }),
    ).resolves.toBeNull()
  })
})
