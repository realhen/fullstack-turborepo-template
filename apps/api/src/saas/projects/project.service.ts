import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  PROJECT_MEMBERSHIP_STORE,
  type ProjectMembership,
  type ProjectMembershipStore,
  type ProjectRole,
} from './project.types'

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

  listMembers(projectId: string): Promise<ProjectMembership[]> {
    return this.memberships.listMemberships(projectId)
  }

  addMember(
    project: ProjectMembership['project'],
    userId: string,
    role: ProjectRole,
  ): Promise<ProjectMembership> {
    return this.memberships.upsertMembership({ project, role, userId })
  }
}
