import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Pool } from 'pg'
import { AuthModule } from '../auth/auth.module'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import { ApiKeyService } from './application/api-key.service'
import { InvitationService } from './application/invitation.service'
import { OrganizationManagementService } from './application/organization-management.service'
import {
  ORGANIZATION_PERMISSION_EVALUATOR,
  OrganizationPermissionService,
} from './application/organization-permission.service'
import { OrganizationService } from './application/organization.service'
import { API_KEY_STORE } from './domain/api-key.types'
import { INVITATION_STORE } from './domain/invitation.types'
import { ORGANIZATION_MANAGEMENT_STORE } from './domain/organization-management.types'
import {
  ORGANIZATION_MEMBERSHIP_STORE,
  type OrganizationMembershipStore,
} from './domain/organization.types'
import { DatabaseApiKeyStore } from './infrastructure/database-api-key.store'
import { DatabaseInvitationStore } from './infrastructure/database-invitation.store'
import { DatabaseOrganizationManagementStore } from './infrastructure/database-organization-management.store'
import { DatabaseOrganizationMembershipStore } from './infrastructure/database-organization-membership.store'
import { DatabaseOrganizationPermissionService } from './infrastructure/database-organization-permission.service'
import { InMemoryApiKeyStore } from './infrastructure/in-memory-api-key.store'
import { InMemoryInvitationStore } from './infrastructure/in-memory-invitation.store'
import { InMemoryOrganizationManagementStore } from './infrastructure/in-memory-organization-management.store'
import { InMemoryOrganizationMembershipStore } from './infrastructure/in-memory-organization-membership.store'
import { ApiKeyController } from './presentation/api-key.controller'
import { InvitationController } from './presentation/invitation.controller'
import { OrganizationIdPipe } from './presentation/organization-id.pipe'
import { OrganizationManagementController } from './presentation/organization-management.controller'
import { OrganizationPermissionGuard } from './presentation/organization-permission.guard'
import { OrganizationsController } from './presentation/organizations.controller'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    ApiKeyController,
    InvitationController,
    OrganizationManagementController,
    OrganizationsController,
  ],
  providers: [
    {
      provide: ORGANIZATION_MEMBERSHIP_STORE,
      inject: [ConfigService, DATABASE_POOL],
      useFactory: (config: ConfigService, pool: Pool | null) => {
        if (pool) return new DatabaseOrganizationMembershipStore(pool)
        return new InMemoryOrganizationMembershipStore(
          config.get<string>('AUTH_MODE') === 'local'
            ? [
                {
                  organization: {
                    id: config.getOrThrow<string>('AUTH_LOCAL_ORGANIZATION_ID'),
                    name: config.getOrThrow<string>(
                      'AUTH_LOCAL_ORGANIZATION_NAME',
                    ),
                    slug: config.getOrThrow<string>(
                      'AUTH_LOCAL_ORGANIZATION_SLUG',
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
      provide: ORGANIZATION_PERMISSION_EVALUATOR,
      inject: [ORGANIZATION_MEMBERSHIP_STORE, DATABASE_POOL],
      useFactory: (
        memberships: OrganizationMembershipStore,
        pool: Pool | null,
      ) =>
        pool
          ? new DatabaseOrganizationPermissionService(pool)
          : new OrganizationPermissionService(memberships),
    },
    {
      provide: ORGANIZATION_MANAGEMENT_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) =>
        pool
          ? new DatabaseOrganizationManagementStore(pool)
          : new InMemoryOrganizationManagementStore(),
    },
    {
      provide: INVITATION_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) =>
        pool
          ? new DatabaseInvitationStore(pool)
          : new InMemoryInvitationStore(),
    },
    {
      provide: API_KEY_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new DatabaseApiKeyStore(pool) : new InMemoryApiKeyStore(),
    },
    ApiKeyService,
    InvitationService,
    OrganizationIdPipe,
    OrganizationManagementService,
    OrganizationPermissionGuard,
    OrganizationService,
  ],
  exports: [
    OrganizationIdPipe,
    OrganizationPermissionGuard,
    ORGANIZATION_MEMBERSHIP_STORE,
    ORGANIZATION_PERMISSION_EVALUATOR,
  ],
})
export class OrganizationsModule {}
