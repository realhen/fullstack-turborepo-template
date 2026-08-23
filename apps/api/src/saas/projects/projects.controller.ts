import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { ProjectMembership as ProjectMembershipModel } from '../../openapi.models'
import {
  CurrentPrincipal,
  CurrentProject,
  RequireProjectScopes,
} from '../../common/decorators/auth.decorators'
import type { Principal } from '../../auth/domain/principal'
import { AddProjectMemberDto } from './projects.dto'
import { ProjectIdPipe } from './project-id.pipe'
import { ProjectService } from './project.service'
import type { ProjectMembership } from './project.types'

@ApiTags('projects')
@ApiBearerAuth()
@ApiParam({ format: 'uuid', name: 'projectId', type: String })
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Get(':projectId')
  @RequireProjectScopes(['projects:read'])
  @ApiOkResponse({ type: ProjectMembershipModel })
  getProject(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @CurrentProject() membership: ProjectMembership,
  ) {
    return {
      project: { ...membership.project, id: projectId },
      role: membership.role,
    }
  }

  @Get(':projectId/members')
  @RequireProjectScopes(['projects:members:manage'])
  @ApiOkResponse({ isArray: true, type: ProjectMembershipModel })
  listMembers(
    @CurrentProject() membership: ProjectMembership,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.projects.listMembers(
      membership.project,
      principal.userId ?? principal.id,
    )
  }

  @Post(':projectId/members')
  @RequireProjectScopes(['projects:members:manage'])
  @ApiCreatedResponse({ type: ProjectMembershipModel })
  addMember(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @CurrentProject() membership: ProjectMembership,
    @CurrentPrincipal() principal: Principal,
    @Body() input: AddProjectMemberDto,
  ) {
    return this.projects.addMember(
      { ...membership.project, id: projectId },
      input.userId,
      input.role,
      principal.userId ?? principal.id,
    )
  }
}
