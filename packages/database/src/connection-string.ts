import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'pg'

export type DatabaseEnvironment = NodeJS.ProcessEnv & {
  DATABASE_POOL_CONNECTION_TIMEOUT_MS?: string
  DATABASE_POOL_IDLE_TIMEOUT_MS?: string
  DATABASE_POOL_MAX?: string
  DATABASE_URL?: string
  PGDATABASE?: string
  PGHOST?: string
  PGPASSWORD?: string
  PGPORT?: string
  PGSSLMODE?: string
  PGSSLROOTCERT?: string
  PGUSER?: string
}

function sslConfig(environment: DatabaseEnvironment): PoolConfig['ssl'] {
  const mode = environment.PGSSLMODE
  if (!mode || mode === 'disable') return undefined
  if (!['require', 'verify-ca', 'verify-full'].includes(mode)) {
    throw new Error(
      'PGSSLMODE must be disable, require, verify-ca, or verify-full',
    )
  }
  const rootCert = environment.PGSSLROOTCERT
  if (!rootCert && mode !== 'require') {
    throw new Error(
      'PGSSLROOTCERT is required for PGSSLMODE=verify-ca or verify-full',
    )
  }
  let ca: string | undefined
  if (rootCert) {
    try {
      ca = readFileSync(rootCert, 'utf8')
    } catch {
      throw new Error(
        'PGSSLROOTCERT must point to a readable certificate bundle',
      )
    }
    if (!ca.trim()) {
      throw new Error(
        'PGSSLROOTCERT must point to a readable certificate bundle',
      )
    }
  }
  return { ...(ca ? { ca } : {}), rejectUnauthorized: true }
}

const standardPostgresKeys = [
  'PGHOST',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
] as const

function optionalPositiveInteger(
  environment: DatabaseEnvironment,
  key: keyof DatabaseEnvironment,
): number | undefined {
  const value = environment[key]
  if (value === undefined || value === '') return undefined
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${key} must be a positive integer`)
  }
  return Number(value)
}

/** Builds a portable pg Pool configuration from DATABASE_URL or standard PG* variables. */
export function databaseConfigFromEnvironment(
  environment: DatabaseEnvironment = process.env,
): PoolConfig | undefined {
  const connectionTimeoutMillis = optionalPositiveInteger(
    environment,
    'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
  )
  const idleTimeoutMillis = optionalPositiveInteger(
    environment,
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
  )
  const max = optionalPositiveInteger(environment, 'DATABASE_POOL_MAX')
  const poolSettings: PoolConfig = {
    ...(connectionTimeoutMillis !== undefined
      ? { connectionTimeoutMillis }
      : {}),
    ...(idleTimeoutMillis !== undefined ? { idleTimeoutMillis } : {}),
    ...(max !== undefined ? { max } : {}),
  }

  if (environment.DATABASE_URL) {
    const ssl = sslConfig(environment)
    return {
      connectionString: environment.DATABASE_URL,
      ...(ssl ? { ssl } : {}),
      ...poolSettings,
    }
  }

  const suppliedStandardKeys = standardPostgresKeys.filter(
    (key) => environment[key],
  )
  if (suppliedStandardKeys.length === 0) return undefined
  if (suppliedStandardKeys.length !== standardPostgresKeys.length) {
    throw new Error(
      'DATABASE_URL or complete PGHOST/PGUSER/PGPASSWORD/PGDATABASE configuration is required',
    )
  }

  const ssl = sslConfig(environment)
  return {
    database: environment.PGDATABASE,
    host: environment.PGHOST,
    password: environment.PGPASSWORD,
    ...(environment.PGPORT
      ? { port: optionalPositiveInteger(environment, 'PGPORT') }
      : {}),
    ...(ssl ? { ssl } : {}),
    user: environment.PGUSER,
    ...poolSettings,
  }
}

export function requireDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): PoolConfig {
  const config = databaseConfigFromEnvironment(environment)
  if (!config) {
    throw new Error(
      'DATABASE_URL or complete PGHOST/PGUSER/PGPASSWORD/PGDATABASE configuration is required',
    )
  }
  return config
}
