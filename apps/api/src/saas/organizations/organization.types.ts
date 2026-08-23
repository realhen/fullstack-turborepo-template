export type Organization = {
  id: string
  name: string
  slug: string
}

export type OrganizationMembership = {
  organization: Organization
  role: string | null
  userId: string
}

export interface OrganizationMembershipStore {
  getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null>
  listMemberships(userId: string): Promise<OrganizationMembership[]>
}

export const ORGANIZATION_MEMBERSHIP_STORE = Symbol(
  'ORGANIZATION_MEMBERSHIP_STORE',
)
