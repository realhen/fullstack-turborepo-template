/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest'
import { logoutCookieOptions, logoutDestination } from './logout-service'

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

describe('logoutDestination', () => {
  it('uses the WorkOS logout URL for a valid sealed session', async () => {
    const provider = {
      loadSession: async () => ({
        authenticate: async () => ({ authenticated: false }),
        logoutUrl: async (returnTo: string) =>
          `https://auth.test/logout?returnTo=${encodeURIComponent(returnTo)}`,
        refresh: async () => ({ authenticated: false }),
      }),
    }

    await expect(
      logoutDestination({
        config,
        provider,
        sealedSession: 'sealed',
        returnTo: '/signed-out',
      }),
    ).resolves.toBe('https://auth.test/logout?returnTo=%2Fsigned-out')
  })

  it('falls back locally for local mode, missing sessions, and invalid sessions', async () => {
    await expect(
      logoutDestination({
        config: { mode: 'local', sessionCookieName: 'session' },
      }),
    ).resolves.toBe('/')
    await expect(logoutDestination({ config })).resolves.toBe('/')
    await expect(
      logoutDestination({
        config,
        provider: {
          loadSession: async () => {
            throw new Error('expired')
          },
        },
        sealedSession: 'expired',
      }),
    ).resolves.toBe('/')
  })

  it('rejects unsafe return paths before asking WorkOS to redirect', async () => {
    let requestedReturnTo = ''
    const provider = {
      loadSession: async () => ({
        authenticate: async () => ({ authenticated: false }),
        logoutUrl: async (returnTo: string) => {
          requestedReturnTo = returnTo
          return 'https://auth.test/logout'
        },
        refresh: async () => ({ authenticated: false }),
      }),
    }

    await logoutDestination({
      config,
      provider,
      sealedSession: 'sealed',
      returnTo: 'https://evil.test',
    })

    expect(requestedReturnTo).toBe('/')
  })
})

describe('logoutCookieOptions', () => {
  it('deletes session and flow cookies with matching security attributes', () => {
    const options = logoutCookieOptions(true)

    expect(options.session).toMatchObject({
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
    expect(options.flow).toEqual(options.session)
  })
})
