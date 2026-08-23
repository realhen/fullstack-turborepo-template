import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  CurrentPrincipal,
  RequireOrganizationPermissions,
} from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { OrganizationPermissionGuard } from '../organizations/organization-permission.guard'
import { OrganizationIdPipe } from '../organizations/organization-id.pipe'
import { CreateProjectDto } from './project-management.dto'
import { ProjectManagementService } from './project-management.service'

@ApiTags('projects')
@ApiBearerAuth()
@ApiParam({ format: 'uuid', name: 'organizationId', type: String })
@UseGuards(OrganizationPermissionGuard)
@Controller({ path: 'organizations/:organizationId/projects', version: '1' })
export class ProjectManagementController {
  constructor(private readonly projects: ProjectManagementService) {}

  @Get()
  @RequireOrganizationPermissions(['projects:read'])
  list(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.projects.list(organizationId, principal.userId ?? principal.id)
  }

  @Post()
  @RequireOrganizationPermissions(['projects:write'])
  create(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateProjectDto,
  ) {
    return this.projects.create(
      organizationId,
      principal.userId ?? principal.id,
      input,
    )
  }
}
