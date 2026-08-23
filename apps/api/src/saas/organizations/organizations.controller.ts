import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequireAuthenticated } from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { ListOrganizationsQueryDto } from './organizations.dto'
import { OrganizationService } from './organization.service'

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get()
  @RequireAuthenticated()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListOrganizationsQueryDto,
  ) {
    const memberships = await this.organizations.listForUser(
      principal.userId ?? principal.id,
    )
    return memberships.slice(0, query.limit).map((membership) => ({
      organization: membership.organization,
      role: membership.role,
    }))
  }
}
