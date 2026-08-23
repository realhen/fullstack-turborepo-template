import type {
  ProjectMembership,
  ProjectMembershipStore,
} from '../domain/project.types'

export class InMemoryProjectMembershipStore implements ProjectMembershipStore {
  private readonly memberships = new Map<string, ProjectMembership>()

  constructor(initialMemberships: ProjectMembership[] = []) {
    for (const membership of initialMemberships) {
      this.memberships.set(
        this.key(membership.project.id, membership.userId),
        membership,
      )
    }
  }

  getMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership | null> {
    return Promise.resolve(
      this.memberships.get(this.key(projectId, userId)) ?? null,
    )
  }

  listMemberships(projectId: string): Promise<ProjectMembership[]> {
    return Promise.resolve(
      [...this.memberships.values()].filter(
        (membership) => membership.project.id === projectId,
      ),
    )
  }

  upsertMembership(membership: ProjectMembership): Promise<ProjectMembership> {
    this.memberships.set(
      this.key(membership.project.id, membership.userId),
      membership,
    )
    return Promise.resolve(membership)
  }

  private key(projectId: string, userId: string): string {
    return `${projectId}:${userId}`
  }
}
