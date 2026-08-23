import { PreTenantAuthorizationLookup } from '@repo/database'
import type { Pool } from 'pg'
import type {
  OrganizationMembership,
  OrganizationMembershipStore,
} from './organization.types'

export class DatabaseOrganizationMembershipStore
  implements OrganizationMembershipStore
{
  private readonly authorizationLookup: PreTenantAuthorizationLookup

  constructor(pool: Pool) {
    this.authorizationLookup = new PreTenantAuthorizationLookup(pool)
  }

  async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const memberships = await this.authorizationLookup.listOrganizations(userId)
    const organization = memberships.find((item) => item.id === organizationId)
    return organization
      ? { organization, role: organization.role, userId }
      : null
  }

  async listMemberships(userId: string): Promise<OrganizationMembership[]> {
    const organizations = await this.authorizationLookup.listOrganizations(userId)
    return organizations.map((organization) => ({
      organization,
      role: organization.role,
      userId,
    }))
  }
}
