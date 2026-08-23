import { withTenantRepository } from '@repo/database'
import type { Pool } from 'pg'
import type { OrganizationPermissionEvaluator } from '../application/organization-permission.service'

export class DatabaseOrganizationPermissionService implements OrganizationPermissionEvaluator {
  constructor(private readonly pool: Pool) {}

  async hasAll(
    organizationId: string,
    actorId: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      async (repository) => {
        const results = await Promise.all(
          permissions.map((permission) =>
            repository.hasPermission({ actorId, organizationId }, permission),
          ),
        )
        return results.every(Boolean)
      },
    )
  }
}
