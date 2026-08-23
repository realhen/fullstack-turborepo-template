import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  ORGANIZATION_MEMBERSHIP_STORE,
  type OrganizationMembership,
  type OrganizationMembershipStore,
} from './organization.types'

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_MEMBERSHIP_STORE)
    private readonly memberships: OrganizationMembershipStore,
  ) {}

  listForUser(userId: string): Promise<OrganizationMembership[]> {
    return this.memberships.listMemberships(userId)
  }

  async requireMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.memberships.getMembership(organizationId, userId)
    if (!membership) throw new NotFoundException('Organization was not found')
    return membership
  }
}
