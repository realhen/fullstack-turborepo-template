import { randomUUID } from 'node:crypto'
import type { ProjectManagementStore, ProjectSummary } from './project-management.types'

export class InMemoryProjectManagementStore implements ProjectManagementStore {
  private readonly projects = new Map<
    string,
    ProjectSummary & { organizationId: string }
  >()

  async create(
    organizationId: string,
    _actorId: string,
    input: Omit<ProjectSummary, 'id'>,
  ): Promise<ProjectSummary> {
    if (
      [...this.projects.values()].some(
        (project) =>
          project.organizationId === organizationId && project.slug === input.slug,
      )
    ) {
      throw new Error('Project slug already exists in organization')
    }
    const project = { ...input, id: randomUUID(), organizationId }
    this.projects.set(project.id, project)
    return project
  }

  async list(organizationId: string): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .filter((project) => project.organizationId === organizationId)
      .map(({ organizationId: _organizationId, ...project }) => project)
  }
}
