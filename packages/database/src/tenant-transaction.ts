import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool, PoolClient } from 'pg'
import { SaasRepository } from './repository'
import { assertTenantContext, type TenantContext } from './tenant'
import type { SaasDatabase } from './repository'

/**
 * Executes queries as the non-owner `saas_runtime` database role and scopes
 * PostgreSQL RLS policies to the API-authorized tenant for this transaction.
 */
export async function withTenantTransaction<T>(
  pool: Pool,
  context: TenantContext,
  operation: (database: SaasDatabase) => Promise<T>,
): Promise<T> {
  assertTenantContext(context)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await establishTenantContext(client, context)
    const result = await operation(drizzle(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/** Preferred entry point for API request handlers using durable SaaS data. */
export function withTenantRepository<T>(
  pool: Pool,
  context: TenantContext,
  operation: (repository: SaasRepository) => Promise<T>,
): Promise<T> {
  return withTenantTransaction(pool, context, (database) =>
    operation(new SaasRepository(database)),
  )
}

async function establishTenantContext(
  client: PoolClient,
  context: TenantContext,
): Promise<void> {
  await client.query('SET LOCAL ROLE saas_runtime')
  await client.query(
    `SELECT set_config('app.organization_id', $1, true),
            set_config('app.actor_id', $2, true)`,
    [context.organizationId, context.actorId],
  )
}
