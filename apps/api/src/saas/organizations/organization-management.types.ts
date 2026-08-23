export type CreateOrganizationInput = {
  name: string
  slug: string
}

export interface OrganizationManagementStore {
  create(
    input: CreateOrganizationInput,
    ownerId: string,
  ): Promise<{ id: string; name: string; slug: string }>
}

export const ORGANIZATION_MANAGEMENT_STORE = Symbol('ORGANIZATION_MANAGEMENT_STORE')
