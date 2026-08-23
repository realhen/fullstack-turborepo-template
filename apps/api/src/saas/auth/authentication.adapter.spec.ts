import { describe, expect, it } from 'vitest'
import {
  DisabledAuthenticationAdapter,
  LocalTokenAuthenticationAdapter,
  principalFromJwt,
} from './authentication.adapter'

describe('authentication adapters', () => {
  it('fails closed when authentication is disabled', async () => {
    await expect(
      new DisabledAuthenticationAdapter().authenticate('token'),
    ).rejects.toThrow('Authentication is disabled')
  })

  it('accepts only the configured local token', async () => {
    const adapter = new LocalTokenAuthenticationAdapter(
      'this-is-a-local-test-token-that-is-long-enough',
      { id: 'local-user', provider: 'local', scopes: ['profile:read'] },
    )

    await expect(
      adapter.authenticate('this-is-a-local-test-token-that-is-long-enough'),
    ).resolves.toMatchObject({ id: 'local-user' })
    await expect(adapter.authenticate('wrong-token')).rejects.toThrow(
      'Invalid bearer token',
    )
  })

  it('normalizes provider-neutral OIDC scope claim formats', () => {
    const principal = principalFromJwt(
      {
        permissions: ['projects.write'],
        scope: 'projects.read profile.read',
        scp: ['projects.members.manage'],
        sub: 'subject-1',
      },
      'https://issuer.example',
    )

    expect(principal.id).toBe('subject-1')
    expect(principal.scopes).toEqual(
      expect.arrayContaining([
        'profile.read',
        'projects.members.manage',
        'projects.read',
        'projects.write',
      ]),
    )
  })
})
