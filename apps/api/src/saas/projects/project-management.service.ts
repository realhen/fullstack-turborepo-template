import { Inject, Injectable } from '@nestjs/common'
import {
  PROJECT_MANAGEMENT_STORE,
  type ProjectManagementStore,
} from './project-management.types'

@Injectable()
export class ProjectManagementService {
  constructor(
    @Inject(PROJECT_MANAGEMENT_STORE)
    private readonly projects: ProjectManagementStore,
  ) {}

  create(organizationId: string, actorId: string, input: { name: string; slug: string }) {
    return this.projects.create(organizationId, actorId, input)
  }

  list(organizationId: string, actorId: string) {
    return this.projects.list(organizationId, actorId)
  }
}
