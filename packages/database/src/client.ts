import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { requireDatabaseUrl } from './connection-string'

export function createDatabase(connectionString = requireDatabaseUrl()) {
  const pool = new Pool({ connectionString })
  return { db: drizzle(pool, { schema }), pool }
}
