import { randomUUID } from 'node:crypto'
import type {
  CreateOrganizationInput,
  OrganizationManagementStore,
} from './organization-management.types'

export class InMemoryOrganizationManagementStore implements OrganizationManagementStore {
  private readonly organizations = new Map<
    string,
    { id: string; name: string; slug: string }
  >()

  create(
    input: CreateOrganizationInput,
  ): Promise<{ id: string; name: string; slug: string }> {
    if (
      [...this.organizations.values()].some(
        (organization) => organization.slug === input.slug,
      )
    ) {
      return Promise.reject(new Error('Organization slug already exists'))
    }
    const organization = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
    }
    this.organizations.set(organization.id, organization)
    return Promise.resolve(organization)
  }
}
