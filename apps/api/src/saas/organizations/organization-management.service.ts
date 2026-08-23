import { Inject, Injectable } from '@nestjs/common'
import {
  ORGANIZATION_MANAGEMENT_STORE,
  type CreateOrganizationInput,
  type OrganizationManagementStore,
} from './organization-management.types'

@Injectable()
export class OrganizationManagementService {
  constructor(
    @Inject(ORGANIZATION_MANAGEMENT_STORE)
    private readonly organizations: OrganizationManagementStore,
  ) {}

  create(input: CreateOrganizationInput, ownerId: string) {
    return this.organizations.create(input, ownerId)
  }
}
