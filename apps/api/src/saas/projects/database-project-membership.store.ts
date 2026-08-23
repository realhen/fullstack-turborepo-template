import {
  PreTenantAuthorizationLookup,
  withTenantRepository,
} from '@repo/database'
import type { Pool } from 'pg'
import type {
  ProjectMembership,
  ProjectMembershipStore,
  ProjectRole,
} from './project.types'

const supportedRoles = new Set<ProjectRole>([
  'owner',
  'admin',
  'member',
  'viewer',
])

/** PostgreSQL adapter; register this port only when DATABASE_URL is configured. */
export class DatabaseProjectMembershipStore implements ProjectMembershipStore {
  private readonly authorizationLookup: PreTenantAuthorizationLookup

  constructor(private readonly pool: Pool) {
    this.authorizationLookup = new PreTenantAuthorizationLookup(pool)
  }

  async getMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership | null> {
    const membership = await this.authorizationLookup.resolveProjectMembership(
      projectId,
      userId,
    )
    return membership ? this.toProjectMembership(membership) : null
  }

  async listMemberships(projectId: string): Promise<ProjectMembership[]> {
    throw new Error(
      `Project ${projectId} memberships require a tenant-scoped operation`,
    )
  }

  async listMembershipsForTenant(
    organizationId: string,
    actorId: string,
    projectId: string,
  ): Promise<ProjectMembership[]> {
    const memberships = await withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.listProjectMemberships({ actorId, organizationId }, projectId),
    )
    return memberships.map((membership) => this.toProjectMembership(membership))
  }

  async upsertMembership(membership: ProjectMembership): Promise<ProjectMembership> {
    throw new Error(
      `Project ${membership.project.id} membership writes require a tenant-scoped operation`,
    )
  }

  async upsertMembershipForTenant(
    organizationId: string,
    actorId: string,
    membership: ProjectMembership,
  ): Promise<ProjectMembership> {
    if (!membership.project.organizationId) {
      throw new Error('Project organization context is required for database writes')
    }
    if (membership.project.organizationId !== organizationId) {
      throw new Error('Project organization does not match tenant context')
    }
    const persisted = await withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.upsertProjectMembership(
          membership.project.id,
          membership.userId,
          membership.role,
        ),
    )
    return this.toProjectMembership(persisted)
  }

  private toProjectMembership(membership: {
    organizationId: string
    projectId: string
    projectName: string
    roleKey: string | null
    userId: string
  }): ProjectMembership {
    if (
      !membership.roleKey ||
      !supportedRoles.has(membership.roleKey as ProjectRole)
    ) {
      throw new Error('Database membership uses an unsupported project role')
    }
    return {
      project: {
        id: membership.projectId,
        name: membership.projectName,
        organizationId: membership.organizationId,
      },
      role: membership.roleKey as ProjectRole,
      userId: membership.userId,
    }
  }
}
