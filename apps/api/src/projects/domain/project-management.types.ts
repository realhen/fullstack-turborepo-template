export type ProjectSummary = { id: string; name: string; slug: string }

export interface ProjectManagementStore {
  create(
    organizationId: string,
    actorId: string,
    input: Omit<ProjectSummary, 'id'>,
  ): Promise<ProjectSummary>
  list(organizationId: string, actorId: string): Promise<ProjectSummary[]>
}

export const PROJECT_MANAGEMENT_STORE = Symbol('PROJECT_MANAGEMENT_STORE')
