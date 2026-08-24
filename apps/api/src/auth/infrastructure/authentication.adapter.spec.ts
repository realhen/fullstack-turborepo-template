import type { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  DisabledAuthenticationAdapter,
  LocalTokenAuthenticationAdapter,
  principalFromJwt,
} from './authentication.adapter'
import { DatabaseIdentityResolver } from './database-identity-resolver'

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

  it('keeps WorkOS identity claims provider-neutral and provisions verified users', async () => {
    const claims = {
      iss: 'https://id.workos.com/',
      sub: 'user_01HWORKOS',
      client_id: 'client_01HWORKOS',
      email: 'workos-user@example.com',
      email_verified: true,
      roles: ['owner'],
      permissions: ['projects:read'],
    }
    const principal = principalFromJwt(claims, claims.iss)

    expect(principal).toMatchObject({
      id: claims.sub,
      provider: claims.iss,
      email: claims.email,
      emailVerified: true,
      scopes: ['projects:read'],
    })
    expect(principal).not.toHaveProperty('roles')
    expect(principal).not.toHaveProperty('organizationId')
    expect(principal).not.toHaveProperty('projectId')
    expect(principal).not.toHaveProperty('userId')

    const queries: string[] = []
    const client = {
      query: (query: string) =>
        Promise.resolve().then(() => {
          queries.push(query)
          if (query.includes('resolve_linked_user_id'))
            return { rows: [{ user_id: null }] }
          if (query.includes('provision_external_identity'))
            return { rows: [{ user_id: 'application-user-1' }] }
          return { rows: [] }
        }),
      release: () => undefined,
    }
    const resolver = new DatabaseIdentityResolver({
      connect: () => Promise.resolve(client),
    } as unknown as Pool)

    await expect(
      resolver.resolve({ ...principal, emailVerified: false }),
    ).rejects.toThrow('A verified provider email is required')
    await expect(resolver.resolve(principal)).resolves.toMatchObject({
      userId: 'application-user-1',
    })
    expect(
      queries.filter((query) => query.includes('provision_external_identity')),
    ).toHaveLength(1)
  })
})
