/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest'
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
    const authenticate = vi.fn().mockResolvedValue({
      authenticated: true,
      accessToken: 'access',
      user: { id: 'user', email: 'user@example.com' },
    })
    const refresh = vi.fn().mockResolvedValue({ authenticated: false })
    const logoutUrl = vi.fn(
      async (returnTo: string) =>
        `https://auth.test/logout?returnTo=${encodeURIComponent(returnTo)}`,
    )
    const provider = {
      loadSession: async () => ({
        authenticate,
        logoutUrl,
        refresh,
      }),
    }

    await expect(
      logoutDestination({
        config,
        provider,
        sealedSession: 'sealed',
        returnTo: '/signed-out',
      }),
    ).resolves.toBe(
      'https://auth.test/logout?returnTo=https%3A%2F%2Fapp.test%2Fsigned-out',
    )
    expect(authenticate).toHaveBeenCalledOnce()
    expect(refresh).not.toHaveBeenCalled()
    expect(logoutUrl).toHaveBeenCalledOnce()
  })

  it('refreshes an expired sealed session before obtaining its logout URL', async () => {
    const refresh = vi.fn().mockResolvedValue({
      authenticated: true,
      sealedSession: 'refreshed',
      accessToken: 'access',
      user: { id: 'user', email: 'user@example.com' },
    })
    const logoutUrl = vi.fn().mockResolvedValue('https://auth.test/logout')
    await expect(
      logoutDestination({
        config,
        sealedSession: 'expired',
        provider: {
          loadSession: async () => ({
            authenticate: async () => ({ authenticated: false }),
            refresh,
            logoutUrl,
          }),
        },
      }),
    ).resolves.toBe('https://auth.test/logout')
    expect(refresh).toHaveBeenCalledOnce()
    expect(logoutUrl).toHaveBeenCalledOnce()
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
        authenticate: async () => ({
          authenticated: true,
          accessToken: 'access',
          user: { id: 'user', email: 'user@example.com' },
        }),
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

    expect(requestedReturnTo).toBe('https://app.test/')
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
