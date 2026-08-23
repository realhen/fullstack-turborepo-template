import { randomUUID } from 'node:crypto'
import type {
  ProjectManagementStore,
  ProjectSummary,
} from '../domain/project-management.types'

export class InMemoryProjectManagementStore implements ProjectManagementStore {
  private readonly projects = new Map<
    string,
    ProjectSummary & { organizationId: string }
  >()

  create(
    organizationId: string,
    _actorId: string,
    input: Omit<ProjectSummary, 'id'>,
  ): Promise<ProjectSummary> {
    void _actorId
    if (
      [...this.projects.values()].some(
        (project) =>
          project.organizationId === organizationId &&
          project.slug === input.slug,
      )
    ) {
      return Promise.reject(
        new Error('Project slug already exists in organization'),
      )
    }
    const project = { ...input, id: randomUUID(), organizationId }
    this.projects.set(project.id, project)
    return Promise.resolve(project)
  }

  list(organizationId: string): Promise<ProjectSummary[]> {
    return Promise.resolve(
      [...this.projects.values()]
        .filter((project) => project.organizationId === organizationId)
        .map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
        })),
    )
  }
}
