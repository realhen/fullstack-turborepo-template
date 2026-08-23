import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  PROJECT_MEMBERSHIP_STORE,
  type ProjectMembership,
  type ProjectMembershipStore,
  type ProjectRole,
} from '../domain/project.types'

const roleScopes: Record<ProjectRole, readonly string[]> = {
  owner: ['projects:read', 'projects:write', 'projects:members:manage'],
  admin: ['projects:read', 'projects:write', 'projects:members:manage'],
  member: ['projects:read', 'projects:write'],
  viewer: ['projects:read'],
}

@Injectable()
export class ProjectService {
  constructor(
    @Inject(PROJECT_MEMBERSHIP_STORE)
    private readonly memberships: ProjectMembershipStore,
  ) {}

  getMembership(projectId: string, userId: string) {
    return this.memberships.getMembership(projectId, userId)
  }

  hasRoleScopes(role: ProjectRole, requiredScopes: readonly string[]): boolean {
    return requiredScopes.every((scope) => roleScopes[role].includes(scope))
  }

  async getProjectForMember(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership> {
    const membership = await this.getMembership(projectId, userId)
    if (!membership) throw new NotFoundException('Project was not found')
    return membership
  }

  listMembers(
    project: ProjectMembership['project'],
    actorId: string,
  ): Promise<ProjectMembership[]> {
    if (this.memberships.listMembershipsForTenant && project.organizationId) {
      return this.memberships.listMembershipsForTenant(
        project.organizationId,
        actorId,
        project.id,
      )
    }
    return this.memberships.listMemberships(project.id)
  }

  addMember(
    project: ProjectMembership['project'],
    userId: string,
    role: ProjectRole,
    actorId: string,
  ): Promise<ProjectMembership> {
    if (this.memberships.upsertMembershipForTenant && project.organizationId) {
      return this.memberships.upsertMembershipForTenant(
        project.organizationId,
        actorId,
        { project, role, userId },
      )
    }
    return this.memberships.upsertMembership({ project, role, userId })
  }
}
