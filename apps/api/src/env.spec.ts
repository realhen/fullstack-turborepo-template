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

  it.each(['AUTH_ISSUER', 'AUTH_JWKS_URI'])(
    'requires HTTPS for production %s',
    (key) => {
      const environment = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:password@database.example.com/app',
        AUTH_MODE: 'oidc',
        AUTH_ISSUER: 'https://issuer.example.com/',
        AUTH_JWKS_URI: 'https://issuer.example.com/.well-known/jwks.json',
        AUTH_AUDIENCE: 'api-audience',
        [key]: 'http://issuer.example.com/insecure',
      }
      expect(() => validateEnvironment(environment)).toThrow(
        `${key} must use HTTPS in production.`,
      )
    },
  )
})
