import { describe, expect, it } from 'vitest'
import {
  databaseConfigFromEnvironment,
  requireDatabaseConfig,
} from '../src/connection-string'

describe('databaseConfigFromEnvironment', () => {
  it('prefers DATABASE_URL and applies bounded pool settings', () => {
    expect(
      databaseConfigFromEnvironment({
        DATABASE_POOL_CONNECTION_TIMEOUT_MS: '2500',
        DATABASE_POOL_IDLE_TIMEOUT_MS: '15000',
        DATABASE_POOL_MAX: '6',
        DATABASE_URL: 'postgresql://app:secret@db:5432/app',
      }),
    ).toEqual({
      connectionString: 'postgresql://app:secret@db:5432/app',
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 15000,
      max: 6,
    })
  })

  it('supports standard PostgreSQL environment variables', () => {
    expect(
      databaseConfigFromEnvironment({
        PGDATABASE: 'app',
        PGHOST: 'db.internal',
        PGPASSWORD: 'secret',
        PGPORT: '5432',
        PGSSLMODE: 'require',
        PGUSER: 'runtime',
      }),
    ).toMatchObject({
      database: 'app',
      host: 'db.internal',
      password: 'secret',
      port: 5432,
      ssl: { rejectUnauthorized: true },
      user: 'runtime',
    })
  })

  it('rejects partial standard PostgreSQL configuration', () => {
    expect(() => requireDatabaseConfig({ PGHOST: 'db.internal' })).toThrow(
      'DATABASE_URL or complete PGHOST/PGUSER/PGPASSWORD/PGDATABASE configuration is required',
    )
  })
})
