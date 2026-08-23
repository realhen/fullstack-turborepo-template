import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequireAuthenticated } from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { CreateOrganizationDto } from './organization-management.dto'
import { OrganizationManagementService } from './organization-management.service'

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
export class OrganizationManagementController {
  constructor(private readonly organizations: OrganizationManagementService) {}

  @Post()
  @RequireAuthenticated()
  create(@Body() input: CreateOrganizationDto, @CurrentPrincipal() principal: Principal) {
    return this.organizations.create(input, principal.userId ?? principal.id)
  }
}
