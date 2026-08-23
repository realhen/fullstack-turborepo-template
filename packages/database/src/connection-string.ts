type DatabaseEnvironment = {
  DATABASE_SECRET?: string
  DATABASE_URL?: string
}

type RdsSecret = {
  dbname?: string
  host?: string
  password?: string
  port?: number | string
  username?: string
}

/** Supports a normal local URL or the JSON secret injected by ECS/RDS. */
export function databaseUrlFromEnvironment(
  environment: DatabaseEnvironment = process.env,
): string | undefined {
  if (environment.DATABASE_URL) return environment.DATABASE_URL
  if (!environment.DATABASE_SECRET) return undefined

  let secret: RdsSecret
  try {
    secret = JSON.parse(environment.DATABASE_SECRET) as RdsSecret
  } catch {
    throw new Error('DATABASE_SECRET must be valid RDS secret JSON')
  }
  if (!secret.host || !secret.username || !secret.password || !secret.dbname) {
    throw new Error(
      'DATABASE_SECRET requires host, username, password, and dbname fields',
    )
  }

  const username = encodeURIComponent(secret.username)
  const password = encodeURIComponent(secret.password)
  const port = String(secret.port ?? 5432)
  return `postgresql://${username}:${password}@${secret.host}:${port}/${encodeURIComponent(secret.dbname)}?sslmode=require`
}

export function requireDatabaseUrl(
  environment: DatabaseEnvironment = process.env,
): string {
  const databaseUrl = databaseUrlFromEnvironment(environment)
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DATABASE_SECRET is required')
  }
  return databaseUrl
}
