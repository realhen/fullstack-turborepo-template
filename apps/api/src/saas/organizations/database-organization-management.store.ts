import { withTenantRepository } from '@repo/database'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type {
  CreateOrganizationInput,
  OrganizationManagementStore,
} from './organization-management.types'

export class DatabaseOrganizationManagementStore
  implements OrganizationManagementStore
{
  constructor(private readonly pool: Pool) {}

  create(input: CreateOrganizationInput, ownerId: string) {
    const organizationId = randomUUID()
    return withTenantRepository(
      this.pool,
      { actorId: ownerId, organizationId },
      (repository) =>
        repository.createOrganization({
          id: organizationId,
          name: input.name,
          ownerId,
          slug: input.slug,
        }),
    )
  }
}
