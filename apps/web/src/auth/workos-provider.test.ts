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
})
