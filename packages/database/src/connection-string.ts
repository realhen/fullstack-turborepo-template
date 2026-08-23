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
  PGUSER?: string
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
    ...(connectionTimeoutMillis !== undefined ? { connectionTimeoutMillis } : {}),
    ...(idleTimeoutMillis !== undefined ? { idleTimeoutMillis } : {}),
    ...(max !== undefined ? { max } : {}),
  }

  if (environment.DATABASE_URL) {
    return { connectionString: environment.DATABASE_URL, ...poolSettings }
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

  return {
    database: environment.PGDATABASE,
    host: environment.PGHOST,
    password: environment.PGPASSWORD,
    ...(environment.PGPORT ? { port: optionalPositiveInteger(environment, 'PGPORT') } : {}),
    ...(environment.PGSSLMODE === 'require'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
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
