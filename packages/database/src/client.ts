import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import * as schema from './schema'
import { requireDatabaseConfig } from './connection-string'

export function createDatabase(config: PoolConfig = requireDatabaseConfig()) {
  const pool = new Pool(config)
  return { db: drizzle(pool, { schema }), pool }
}
