import type {
  OrganizationMembership,
  OrganizationMembershipStore,
} from './organization.types'

export class InMemoryOrganizationMembershipStore implements OrganizationMembershipStore {
  constructor(private readonly memberships: OrganizationMembership[] = []) {}

  getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    return Promise.resolve(
      this.memberships.find(
        (membership) =>
          membership.organization.id === organizationId &&
          membership.userId === userId,
      ) ?? null,
    )
  }

  listMemberships(userId: string): Promise<OrganizationMembership[]> {
    return Promise.resolve(
      this.memberships.filter((membership) => membership.userId === userId),
    )
  }
}
