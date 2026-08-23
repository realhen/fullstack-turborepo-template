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
})
