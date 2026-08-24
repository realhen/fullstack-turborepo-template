import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  WorkosAuthenticationProvider,
  type WorkosClient,
} from './workos-provider'
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
const response = {
  accessToken: 'access',
  sealedSession: 'sealed',
  user: {
    id: 'user',
    email: 'user@app.test',
    emailVerified: true,
    firstName: null,
    lastName: null,
  },
}
describe('WorkOS adapter', () => {
  it('creates a password user without immediately authenticating it', async () => {
    const createUser = vi.fn().mockResolvedValue({ id: 'user' })
    const authenticateWithPassword = vi.fn()
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { createUser, authenticateWithPassword },
    } as unknown as WorkosClient)

    await provider.signUp({
      email: 'user@app.test',
      password: 'password',
      ipAddress: '203.0.113.1',
      userAgent: 'agent',
    })

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@app.test',
        password: 'password',
        ipAddress: '203.0.113.1',
        userAgent: 'agent',
      }),
    )
    expect(authenticateWithPassword).not.toHaveBeenCalled()
  })

  it('maps trusted context and opaque signals to password authentication and seals a session', async () => {
    const authenticateWithPassword = vi.fn().mockResolvedValue(response)
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { authenticateWithPassword },
    } as unknown as WorkosClient)
    await expect(
      provider.authenticateWithPassword({
        email: 'user@app.test',
        password: 'password',
        ipAddress: '203.0.113.1',
        userAgent: 'agent',
        signalsId: 'opaque',
      }),
    ).resolves.toMatchObject({
      status: 'authenticated',
      sealedSession: 'sealed',
    })
    expect(authenticateWithPassword).toHaveBeenCalledWith({
      email: 'user@app.test',
      password: 'password',
      ipAddress: '203.0.113.1',
      userAgent: 'agent',
      signalsId: 'opaque',
      session: { cookiePassword: config.cookiePassword, sealSession: true },
    })
  })
  it('uses a derived S256 PKCE challenge and never sends the verifier as a challenge', async () => {
    const getAuthorizationUrl = vi
      .fn()
      .mockReturnValue('https://workos.test/authorize')
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { getAuthorizationUrl },
    } as unknown as WorkosClient)
    await provider.authorizationUrl({
      codeVerifier: 'verifier',
      state: 'state',
    })
    expect(getAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        codeChallenge: createHash('sha256')
          .update('verifier')
          .digest('base64url'),
        codeChallengeMethod: 'S256',
      }),
    )
  })
  it('completes Radar SMS only with server flow verification context', async () => {
    const authenticateWithRadarSmsChallenge = vi
      .fn()
      .mockResolvedValue(response)
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { authenticateWithRadarSmsChallenge },
    } as unknown as WorkosClient)
    await provider.completeRadarChallenge({
      type: 'sms',
      code: '123456',
      pendingAuthenticationToken: 'pending',
      challengeId: 'ignored',
      verificationId: 'verification',
      phoneNumber: '+14165551234',
      ipAddress: '203.0.113.1',
      userAgent: 'agent',
    })
    expect(authenticateWithRadarSmsChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '203.0.113.1',
        userAgent: 'agent',
        verificationId: 'verification',
        phoneNumber: '+14165551234',
        pendingAuthenticationToken: 'pending',
      }),
    )
  })
  it('passes trusted context to Radar email completion', async () => {
    const authenticateWithRadarEmailChallenge = vi
      .fn()
      .mockResolvedValue(response)
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { authenticateWithRadarEmailChallenge },
    } as unknown as WorkosClient)
    await provider.completeRadarChallenge({
      type: 'email',
      code: '123456',
      pendingAuthenticationToken: 'pending',
      challengeId: 'challenge',
      ipAddress: '203.0.113.1',
      userAgent: 'agent',
    })
    expect(authenticateWithRadarEmailChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '203.0.113.1', userAgent: 'agent' }),
    )
  })
  it('starts a TOTP challenge from a trusted factor ID', async () => {
    const challengeFactor = vi.fn().mockResolvedValue({ id: 'challenge' })
    const provider = new WorkosAuthenticationProvider(config, {
      multiFactorAuth: { challengeFactor },
    } as unknown as WorkosClient)
    await expect(
      provider.startTotpChallenge({ factorId: 'factor' }),
    ).resolves.toEqual({ challengeId: 'challenge' })
    expect(challengeFactor).toHaveBeenCalledWith({
      authenticationFactorId: 'factor',
    })
  })
  it('passes a server-validated organization selection with sealed-session options', async () => {
    const authenticateWithOrganizationSelection = vi
      .fn()
      .mockResolvedValue(response)
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { authenticateWithOrganizationSelection },
    } as unknown as WorkosClient)
    await provider.authenticateWithOrganizationSelection({
      organizationId: 'org',
      pendingAuthenticationToken: 'pending',
    })
    expect(authenticateWithOrganizationSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        pendingAuthenticationToken: 'pending',
        session: { cookiePassword: config.cookiePassword, sealSession: true },
      }),
    )
  })

  it('preserves retryable WorkOS refresh failures', async () => {
    const loadSealedSession = vi.fn().mockReturnValue({
      authenticate: () => Promise.resolve({ authenticated: false }),
      refresh: () =>
        Promise.resolve({
          authenticated: false,
          retryable: true,
          reason: 'network_error',
        }),
      getLogoutUrl: () => Promise.resolve('https://auth.test/logout'),
    })
    const provider = new WorkosAuthenticationProvider(config, {
      userManagement: { loadSealedSession },
    } as unknown as WorkosClient)

    const session = await provider.loadSession('sealed')
    await expect(session.refresh()).resolves.toEqual({
      authenticated: false,
      retryable: true,
      reason: 'network_error',
    })
  })
})
