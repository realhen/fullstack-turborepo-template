import { withTenantRepository } from '@repo/database'
import type { Pool } from 'pg'
import type {
  ProjectManagementStore,
  ProjectSummary,
} from '../domain/project-management.types'

export class DatabaseProjectManagementStore implements ProjectManagementStore {
  constructor(private readonly pool: Pool) {}

  create(
    organizationId: string,
    actorId: string,
    input: Omit<ProjectSummary, 'id'>,
  ): Promise<ProjectSummary> {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.createProject({ actorId, organizationId }, input),
    )
  }

  list(organizationId: string, actorId: string): Promise<ProjectSummary[]> {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) => repository.listProjects({ actorId, organizationId }),
    )
  }
}
