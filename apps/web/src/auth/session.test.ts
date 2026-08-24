/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest'
import type { AuthenticationProvider, ProviderSession } from './provider'
import { authenticateWebSession, sessionCookieUpdate } from './session'
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

  it('preserves the sealed cookie when current-session JWKS verification throws', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'sealed',
        provider: {
          loadSession: async () => ({
            authenticate: async () => {
              throw Object.assign(new Error('request timed out'), {
                code: 'ERR_JWKS_TIMEOUT',
              })
            },
            refresh: async () => ({ authenticated: false, retryable: false }),
          }),
        } as any,
      }),
    ).resolves.toEqual({
      authenticated: false,
      clearCookie: false,
      retryable: true,
    })
  })

  it('clears the sealed cookie when authentication throws a terminal error', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'sealed',
        provider: {
          loadSession: async () => ({
            authenticate: async () => {
              throw new Error('unrecoverable session data')
            },
            refresh: async () => ({ authenticated: false, retryable: false }),
          }),
        } as any,
      }),
    ).resolves.toEqual({ authenticated: false, clearCookie: true })
  })

  it('redirects without deleting a cookie after terminal refresh failures', async () => {
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
    ).resolves.toEqual({ authenticated: false, clearCookie: false })
  })

  it('clears a structurally invalid sealed cookie after refresh', async () => {
    await expect(
      authenticateWebSession({
        config,
        sealedSession: 'malformed',
        provider: {
          loadSession: async () => ({
            authenticate: async () => ({ authenticated: false }),
            refresh: async () => ({
              authenticated: false,
              retryable: false,
              reason: 'invalid_session_cookie',
            }),
          }),
        } as any,
      }),
    ).resolves.toEqual({ authenticated: false, clearCookie: true })
  })

  it('does not let a stale terminal refresh response erase a rotated cookie', async () => {
    let releaseStaleRefresh!: () => void
    const staleRefresh = new Promise<void>((resolve) => {
      releaseStaleRefresh = resolve
    })
    const providerSession = (
      refresh: ProviderSession['refresh'],
    ): AuthenticationProvider =>
      ({
        loadSession: async () =>
          ({
            authenticate: async () => ({ authenticated: false }),
            refresh,
          }) as ProviderSession,
      }) as unknown as AuthenticationProvider

    const staleRequest = authenticateWebSession({
      config,
      sealedSession: 'original',
      provider: providerSession(async () => {
        await staleRefresh
        return {
          authenticated: false,
          retryable: false,
          reason: 'invalid_grant',
        }
      }),
    })
    const successfulRequest = authenticateWebSession({
      config,
      sealedSession: 'original',
      provider: providerSession(async () => ({
        authenticated: true,
        sealedSession: 'rotated',
        accessToken: 'access',
        user: { id: 'u', email: 'u@test' },
      })),
    })

    let browserCookie: string | undefined = 'original'
    const successful = await successfulRequest
    browserCookie = sessionCookieUpdate(successful) ?? browserCookie
    releaseStaleRefresh()
    const stale = await staleRequest
    const staleUpdate = sessionCookieUpdate(stale)
    if (staleUpdate === null) browserCookie = undefined
    else if (staleUpdate) browserCookie = staleUpdate

    expect(browserCookie).toBe('rotated')
  })
})
