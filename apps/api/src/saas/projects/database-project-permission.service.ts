import { withTenantRepository } from '@repo/database'
import type { Pool } from 'pg'

/** Durable role/permission evaluator for database-backed tenant operations. */
export class DatabaseProjectPermissionService {
  constructor(private readonly pool: Pool) {}

  async hasAll(
    organizationId: string,
    actorId: string,
    projectId: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      async (repository) => {
        const results = await Promise.all(
          permissions.map((permission) =>
            repository.hasPermission(
              { actorId, organizationId },
              permission,
              projectId,
            ),
          ),
        )
        return results.every(Boolean)
      },
    )
  }
}
