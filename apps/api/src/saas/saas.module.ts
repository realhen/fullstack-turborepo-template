import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Pool } from 'pg'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import { AuditReadController } from './audit/audit-read.controller'
import { AuditReadService } from './audit/audit-read.service'
import { AUDIT_READ_STORE } from './audit/audit-read.types'
import { AuditService } from './audit/audit.service'
import { AUDIT_STORE } from './audit/audit.types'
import { DatabaseAuditReadStore } from './audit/database-audit-read.store'
import { DatabaseAuditStore } from './audit/database-audit.store'
import { InMemoryAuditReadStore } from './audit/in-memory-audit-read.store'
import {
  DisabledAuthenticationAdapter,
  LocalTokenAuthenticationAdapter,
  OidcJwksAuthenticationAdapter,
  type AuthenticationAdapter,
} from './auth/authentication.adapter'
import {
  AUTHENTICATION_ADAPTER,
  AuthenticationService,
} from './auth/authentication.service'
import { DatabaseIdentityResolver } from './auth/database-identity-resolver'
import {
  IDENTITY_RESOLVER,
  type IdentityResolver,
} from './auth/identity-resolver'
import { ScopeGuard } from './auth/scope.guard'
import { BillingModule } from './billing/billing.module'
import { ApiKeyController } from './organizations/api-key.controller'
import { ApiKeyService } from './organizations/api-key.service'
import { API_KEY_STORE } from './organizations/api-key.types'
import { DatabaseApiKeyStore } from './organizations/database-api-key.store'
import { DatabaseInvitationStore } from './organizations/database-invitation.store'
import { DatabaseOrganizationManagementStore } from './organizations/database-organization-management.store'
import { DatabaseOrganizationMembershipStore } from './organizations/database-organization-membership.store'
import { DatabaseOrganizationPermissionService } from './organizations/database-organization-permission.service'
import { InMemoryApiKeyStore } from './organizations/in-memory-api-key.store'
import { InMemoryInvitationStore } from './organizations/in-memory-invitation.store'
import { InMemoryOrganizationManagementStore } from './organizations/in-memory-organization-management.store'
import { InMemoryOrganizationMembershipStore } from './organizations/in-memory-organization-membership.store'
import { InvitationController } from './organizations/invitation.controller'
import { InvitationService } from './organizations/invitation.service'
import { INVITATION_STORE } from './organizations/invitation.types'
import { OrganizationIdPipe } from './organizations/organization-id.pipe'
import { OrganizationManagementController } from './organizations/organization-management.controller'
import { OrganizationManagementService } from './organizations/organization-management.service'
import { ORGANIZATION_MANAGEMENT_STORE } from './organizations/organization-management.types'
import { OrganizationPermissionGuard } from './organizations/organization-permission.guard'
import {
  ORGANIZATION_PERMISSION_EVALUATOR,
  OrganizationPermissionService,
} from './organizations/organization-permission.service'
import { OrganizationService } from './organizations/organization.service'
import {
  ORGANIZATION_MEMBERSHIP_STORE,
  type OrganizationMembershipStore,
} from './organizations/organization.types'
import { OrganizationsController } from './organizations/organizations.controller'
import { DatabaseProjectManagementStore } from './projects/database-project-management.store'
import { DatabaseProjectMembershipStore } from './projects/database-project-membership.store'
import { InMemoryProjectManagementStore } from './projects/in-memory-project-management.store'
import { InMemoryProjectMembershipStore } from './projects/in-memory-project-membership.store'
import { MeController } from './projects/me.controller'
import { ProjectIdPipe } from './projects/project-id.pipe'
import { ProjectManagementController } from './projects/project-management.controller'
import { ProjectManagementService } from './projects/project-management.service'
import { PROJECT_MANAGEMENT_STORE } from './projects/project-management.types'
import { ProjectsController } from './projects/projects.controller'
import { ProjectService } from './projects/project.service'
import { PROJECT_MEMBERSHIP_STORE } from './projects/project.types'

@Module({
  imports: [BillingModule, DatabaseModule],
  controllers: [
    ApiKeyController,
    AuditReadController,
    InvitationController,
    MeController,
    OrganizationManagementController,
    OrganizationsController,
    ProjectManagementController,
    ProjectsController,
  ],
  providers: [
    {
      provide: AUTHENTICATION_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthenticationAdapter => {
        const mode = config.getOrThrow<string>('AUTH_MODE')
        if (mode === 'disabled') return new DisabledAuthenticationAdapter()
        if (mode === 'oidc') {
          return new OidcJwksAuthenticationAdapter(
            config.getOrThrow<string>('AUTH_JWKS_URI'),
            config.getOrThrow<string>('AUTH_ISSUER'),
            config.get<string>('AUTH_AUDIENCE'),
            config.get<string>('AUTH_CLIENT_ID'),
          )
        }
        const email = config.get<string>('AUTH_LOCAL_EMAIL')
        return new LocalTokenAuthenticationAdapter(
          config.getOrThrow<string>('AUTH_LOCAL_TOKEN'),
          {
            id: config.getOrThrow<string>('AUTH_LOCAL_SUBJECT'),
            ...(email ? { email } : {}),
            provider: 'local',
            scopes: config
              .getOrThrow<string>('AUTH_LOCAL_SCOPES')
              .split(/\s*,\s*/)
              .filter(Boolean),
          },
        )
      },
    },
    {
      provide: IDENTITY_RESOLVER,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null): IdentityResolver =>
        pool
          ? new DatabaseIdentityResolver(pool)
          : {
              resolve: (principal) =>
                Promise.resolve({ ...principal, userId: principal.id }),
            },
    },
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
      provide: PROJECT_MANAGEMENT_STORE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool | null) =>
        pool
          ? new DatabaseProjectManagementStore(pool)
          : new InMemoryProjectManagementStore(),
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
    InMemoryAuditReadStore,
    {
      provide: AUDIT_READ_STORE,
      inject: [InMemoryAuditReadStore, DATABASE_POOL],
      useFactory: (memory: InMemoryAuditReadStore, pool: Pool | null) =>
        pool ? new DatabaseAuditReadStore(pool) : memory,
    },
    {
      provide: AUDIT_STORE,
      inject: [InMemoryAuditReadStore, DATABASE_POOL],
      useFactory: (memory: InMemoryAuditReadStore, pool: Pool | null) =>
        pool ? new DatabaseAuditStore(pool) : memory,
    },
    ApiKeyService,
    AuditReadService,
    AuditService,
    AuthenticationService,
    InvitationService,
    OrganizationIdPipe,
    OrganizationManagementService,
    OrganizationPermissionGuard,
    OrganizationService,
    ProjectIdPipe,
    ProjectManagementService,
    ProjectService,
    ScopeGuard,
  ],
  exports: [
    API_KEY_STORE,
    AUDIT_READ_STORE,
    AUDIT_STORE,
    AUTHENTICATION_ADAPTER,
    AuthenticationService,
    IDENTITY_RESOLVER,
    INVITATION_STORE,
    ORGANIZATION_MANAGEMENT_STORE,
    ORGANIZATION_MEMBERSHIP_STORE,
    ORGANIZATION_PERMISSION_EVALUATOR,
    PROJECT_MANAGEMENT_STORE,
    PROJECT_MEMBERSHIP_STORE,
    ProjectService,
    ScopeGuard,
  ],
})
export class SaasModule {}
