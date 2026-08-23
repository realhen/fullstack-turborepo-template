import type {
  OrganizationMembership,
  OrganizationMembershipStore,
} from './organization.types'

export class InMemoryOrganizationMembershipStore implements OrganizationMembershipStore {
  constructor(private readonly memberships: OrganizationMembership[] = []) {}

  async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    return (
      this.memberships.find(
        (membership) =>
          membership.organization.id === organizationId &&
          membership.userId === userId,
      ) ?? null
    )
  }

  async listMemberships(userId: string): Promise<OrganizationMembership[]> {
    return this.memberships.filter((membership) => membership.userId === userId)
  }
}
