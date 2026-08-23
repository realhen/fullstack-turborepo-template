export const PROJECT_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]

export type Project = {
  id: string
  name: string
}

export type ProjectMembership = {
  project: Project
  role: ProjectRole
  userId: string
}

/** Replace this port with a database-backed implementation in production. */
export interface ProjectMembershipStore {
  getMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership | null>
  listMemberships(projectId: string): Promise<ProjectMembership[]>
  upsertMembership(membership: ProjectMembership): Promise<ProjectMembership>
}

export const PROJECT_MEMBERSHIP_STORE = Symbol('PROJECT_MEMBERSHIP_STORE')
