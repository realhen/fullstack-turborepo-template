import { describe, expect, it } from 'vitest'
import { validateEnvironment } from './env'

describe('validateEnvironment', () => {
  it.each(['disable', 'require', 'verify-ca', 'verify-full'])(
    'accepts PostgreSQL SSL mode %s with an optional trusted-root path',
    (mode) => {
      expect(
        validateEnvironment({
          PGSSLMODE: mode,
          PGSSLROOTCERT: '/etc/ssl/certs/postgres-ca.pem',
        }).PGSSLMODE,
      ).toBe(mode)
    },
  )

  it.each([
    ['AUTH_ISSUER', 'https://issuer.example.com/'],
    ['AUTH_JWKS_URI', 'https://issuer.example.com/.well-known/jwks.json'],
    ['AUTH_AUDIENCE', 'api-audience'],
    ['AUTH_CLIENT_ID', 'client-id'],
  ])('rejects %s unless AUTH_MODE=oidc', (key, value) => {
    expect(() => validateEnvironment({ [key]: value })).toThrow()
  })
})
