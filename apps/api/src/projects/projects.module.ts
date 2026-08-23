import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Pool } from 'pg'
import { AuthModule } from '../auth/auth.module'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { ProjectManagementService } from './application/project-management.service'
import { ProjectService } from './application/project.service'
import { PROJECT_MANAGEMENT_STORE } from './domain/project-management.types'
import { PROJECT_MEMBERSHIP_STORE } from './domain/project.types'
import { DatabaseProjectManagementStore } from './infrastructure/database-project-management.store'
import { DatabaseProjectMembershipStore } from './infrastructure/database-project-membership.store'
import { InMemoryProjectManagementStore } from './infrastructure/in-memory-project-management.store'
import { InMemoryProjectMembershipStore } from './infrastructure/in-memory-project-membership.store'
import { MeController } from './presentation/me.controller'
import { ProjectIdPipe } from './presentation/project-id.pipe'
import { ProjectManagementController } from './presentation/project-management.controller'
import { ProjectsController } from './presentation/projects.controller'

@Module({
  imports: [AuthModule, DatabaseModule, OrganizationsModule],
  controllers: [MeController, ProjectManagementController, ProjectsController],
  providers: [
    {
      provide: PROJECT_MEMBERSHIP_STORE,
      inject: [ConfigService, DATABASE_POOL],
      useFactory: (config: ConfigService, pool: Pool | null) => {
        if (pool) return new DatabaseProjectMembershipStore(pool)
        return new InMemoryProjectMembershipStore(
          config.get<string>('AUTH_MODE') === 'local'
            ? [
                {
                  project: {
                    id: config.getOrThrow<string>('AUTH_LOCAL_PROJECT_ID'),
                    name: config.getOrThrow<string>('AUTH_LOCAL_PROJECT_NAME'),
                    organizationId: config.getOrThrow<string>(
                      'AUTH_LOCAL_ORGANIZATION_ID',
                    ),
                  },
                  role: 'owner',
                  userId: config.getOrThrow<string>('AUTH_LOCAL_SUBJECT'),
                },
              ]
            : [],
        )
      },
    },
    {
      provide: PROJECT_MANAGEMENT_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) =>
        pool
          ? new DatabaseProjectManagementStore(pool)
          : new InMemoryProjectManagementStore(),
    },
    ProjectIdPipe,
    ProjectManagementService,
    ProjectService,
  ],
  exports: [PROJECT_MEMBERSHIP_STORE, ProjectService],
})
export class ProjectsModule {}
