import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentProject, RequireProjectScopes } from '../auth/auth.decorators'
import { AddProjectMemberDto } from './projects.dto'
import { ProjectIdPipe } from './project-id.pipe'
import { ProjectService } from './project.service'
import type { ProjectMembership } from './project.types'

@ApiTags('projects')
@ApiBearerAuth()
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Get(':projectId')
  @RequireProjectScopes(['projects:read'])
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
  listMembers(@Param('projectId', ProjectIdPipe) projectId: string) {
    return this.projects.listMembers(projectId)
  }

  @Post(':projectId/members')
  @RequireProjectScopes(['projects:members:manage'])
  addMember(
    @Param('projectId', ProjectIdPipe) projectId: string,
    @CurrentProject() membership: ProjectMembership,
    @Body() input: AddProjectMemberDto,
  ) {
    return this.projects.addMember(
      { ...membership.project, id: projectId },
      input.userId,
      input.role,
    )
  }
}
