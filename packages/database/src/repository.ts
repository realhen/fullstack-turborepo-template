import { and, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  auditEvents,
  apiKeys,
  invitations,
  organizations,
  organizationMemberships,
  permissions,
  projectMemberships,
  projects,
  rolePermissions,
  roles,
  serviceAccounts,
} from './schema'
import { assertTenantContext, type TenantContext } from './tenant'

export type SaasDatabase = NodePgDatabase

export type AuthorizedProjectMembership = {
  organizationId: string
  projectId: string
  projectName: string
  roleKey: string | null
  userId: string
}

/**
 * Database operations that require tenant isolation. This is intentionally a
 * small port: application services must pass TenantContext rather than query
 * tenant tables directly.
 */
export class SaasRepository {
  constructor(private readonly db: SaasDatabase) {}

  async createProject(
    context: TenantContext,
    input: { name: string; slug: string },
  ): Promise<{ id: string; name: string; slug: string }> {
    assertTenantContext(context)
    const [project] = await this.db
      .insert(projects)
      .values({
        name: input.name,
        organizationId: context.organizationId,
        slug: input.slug,
      })
      .returning({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
      })

    if (!project) throw new Error('Project creation did not return a project')
    await this.appendAuditEvent(context, {
      action: 'project.created',
      actorType: 'user',
      resourceId: project.id,
      resourceType: 'project',
    })
    return project
  }

  async createOrganization(input: {
    id: string
    name: string
    ownerId: string
    slug: string
  }): Promise<{ id: string; name: string; slug: string }> {
    const [organization] = await this.db
      .insert(organizations)
      .values({ id: input.id, name: input.name, slug: input.slug })
      .returning({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      })
    if (!organization)
      throw new Error('Organization creation did not return an organization')

    const definitions = [
      {
        key: 'owner',
        name: 'Owner',
        permissions: [
          'organizations:read',
          'members:invite',
          'members:manage',
          'projects:read',
          'projects:write',
          'projects:members:manage',
          'billing:manage',
          'api_keys:manage',
          'audit:read',
        ],
      },
      {
        key: 'admin',
        name: 'Administrator',
        permissions: [
          'organizations:read',
          'members:invite',
          'members:manage',
          'projects:read',
          'projects:write',
          'projects:members:manage',
          'api_keys:manage',
          'audit:read',
        ],
      },
      {
        key: 'member',
        name: 'Member',
        permissions: ['organizations:read', 'projects:read', 'projects:write'],
      },
      {
        key: 'viewer',
        name: 'Viewer',
        permissions: ['organizations:read', 'projects:read'],
      },
    ] as const
    const createdRoles = await this.db
      .insert(roles)
      .values(
        definitions.map((role) => ({
          key: role.key,
          name: role.name,
          organizationId: input.id,
          system: true,
        })),
      )
      .returning({ id: roles.id, key: roles.key })
    const permissionRows = await this.db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(
        inArray(
          permissions.key,
          definitions.flatMap((role) => role.permissions),
        ),
      )
    const permissionIds = new Map(
      permissionRows.map((permission) => [permission.key, permission.id]),
    )
    const roleIds = new Map(createdRoles.map((role) => [role.key, role.id]))
    const rolePermissionRows = definitions.flatMap((role) => {
      const roleId = roleIds.get(role.key)
      if (!roleId) throw new Error(`Missing default role ${role.key}`)
      return role.permissions.map((permission) => {
        const permissionId = permissionIds.get(permission)
        if (!permissionId)
          throw new Error(`Missing seeded permission ${permission}`)
        return { permissionId, roleId }
      })
    })
    await this.db.insert(rolePermissions).values(rolePermissionRows)
    const ownerRoleId = roleIds.get('owner')
    if (!ownerRoleId) throw new Error('Missing owner role')
    await this.db.insert(organizationMemberships).values({
      organizationId: input.id,
      roleId: ownerRoleId,
      userId: input.ownerId,
    })
    await this.appendAuditEvent(
      { actorId: input.ownerId, organizationId: input.id },
      {
        action: 'organization.created',
        actorType: 'user',
        resourceId: organization.id,
        resourceType: 'organization',
      },
    )
    return organization
  }

  listProjects(
    context: TenantContext,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    assertTenantContext(context)
    return this.db
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, context.organizationId),
          eq(projects.status, 'active'),
        ),
      )
      .orderBy(projects.createdAt)
  }

  async createInvitation(
    context: TenantContext,
    input: {
      email: string
      expiresAt: Date
      projectId?: string
      roleId?: string
      tokenHash: string
    },
  ): Promise<{ id: string }> {
    assertTenantContext(context)
    if (input.projectId) {
      const [project] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, context.organizationId),
            eq(projects.status, 'active'),
          ),
        )
        .limit(1)
      if (!project) throw new Error('Invitation project was not found')
    }

    const role = input.roleId
      ? await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(
            and(
              eq(roles.organizationId, context.organizationId),
              eq(roles.id, input.roleId),
            ),
          )
          .limit(1)
      : []
    const roleId = role[0]?.id
    if (input.roleId && !roleId)
      throw new Error('Invitation role was not found')

    let membershipRoleId = roleId
    if (!membershipRoleId) {
      const [defaultRole] = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, context.organizationId),
            eq(roles.key, 'member'),
          ),
        )
        .limit(1)
      membershipRoleId = defaultRole?.id
    }
    if (!membershipRoleId)
      throw new Error('Organization member role was not configured')

    const [invitation] = await this.db
      .insert(invitations)
      .values({
        email: input.email,
        expiresAt: input.expiresAt,
        invitedByUserId: context.actorId,
        organizationId: context.organizationId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        roleId: membershipRoleId,
        tokenHash: input.tokenHash,
      })
      .returning({ id: invitations.id })
    if (!invitation) {
      throw new Error('Invitation creation did not return an invitation')
    }
    await this.appendAuditEvent(context, {
      action: 'invitation.created',
      actorType: 'user',
      metadata: { email: input.email },
      ...(input.projectId ? { projectId: input.projectId } : {}),
      resourceId: invitation.id,
      resourceType: 'invitation',
    })
    return invitation
  }

  async revokeInvitation(
    context: TenantContext,
    invitationId: string,
  ): Promise<boolean> {
    assertTenantContext(context)
    const revoked = await this.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, context.organizationId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id })
    if (!revoked[0]) return false
    await this.appendAuditEvent(context, {
      action: 'invitation.revoked',
      actorType: 'user',
      resourceId: invitationId,
      resourceType: 'invitation',
    })
    return true
  }

  async acceptInvitation(
    context: TenantContext,
    input: { id: string; projectId: string | null; roleId: string | null },
  ): Promise<boolean> {
    assertTenantContext(context)
    const accepted = await this.db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.id, input.id),
          eq(invitations.organizationId, context.organizationId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .returning({ id: invitations.id })
    if (!accepted[0]) return false
    await this.db
      .insert(organizationMemberships)
      .values({
        organizationId: context.organizationId,
        ...(input.roleId ? { roleId: input.roleId } : {}),
        userId: context.actorId,
      })
      .onConflictDoNothing()
    if (input.projectId) {
      await this.db
        .insert(projectMemberships)
        .values({
          organizationId: context.organizationId,
          projectId: input.projectId,
          ...(input.roleId ? { roleId: input.roleId } : {}),
          userId: context.actorId,
        })
        .onConflictDoNothing()
    }
    await this.appendAuditEvent(context, {
      action: 'invitation.accepted',
      actorType: 'user',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      resourceId: input.id,
      resourceType: 'invitation',
    })
    return true
  }

  async createServiceAccount(
    context: TenantContext,
    input: { name: string; projectId?: string },
  ): Promise<{ id: string; name: string }> {
    assertTenantContext(context)
    if (input.projectId) {
      const [project] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, context.organizationId),
            eq(projects.status, 'active'),
          ),
        )
        .limit(1)
      if (!project) throw new Error('Service-account project was not found')
    }
    const [account] = await this.db
      .insert(serviceAccounts)
      .values({
        name: input.name,
        organizationId: context.organizationId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
      })
      .returning({ id: serviceAccounts.id, name: serviceAccounts.name })
    if (!account)
      throw new Error('Service account creation did not return an account')
    await this.appendAuditEvent(context, {
      action: 'service_account.created',
      actorType: 'user',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      resourceId: account.id,
      resourceType: 'service_account',
    })
    return account
  }

  async createApiKey(
    context: TenantContext,
    input: {
      expiresAt?: Date
      prefix: string
      scopes: string[]
      secretHash: string
      serviceAccountId: string
    },
  ): Promise<{ id: string; prefix: string }> {
    assertTenantContext(context)
    const [serviceAccount] = await this.db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(
        and(
          eq(serviceAccounts.id, input.serviceAccountId),
          eq(serviceAccounts.organizationId, context.organizationId),
          eq(serviceAccounts.status, 'active'),
        ),
      )
      .limit(1)
    if (!serviceAccount) throw new Error('Active service account was not found')
    const [key] = await this.db
      .insert(apiKeys)
      .values({
        prefix: input.prefix,
        scopes: input.scopes,
        secretHash: input.secretHash,
        serviceAccountId: input.serviceAccountId,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      })
      .returning({ id: apiKeys.id, prefix: apiKeys.prefix })
    if (!key) throw new Error('API key creation did not return a key')
    await this.appendAuditEvent(context, {
      action: 'api_key.created',
      actorType: 'user',
      resourceId: key.id,
      resourceType: 'api_key',
    })
    return key
  }

  async revokeApiKey(
    context: TenantContext,
    apiKeyId: string,
  ): Promise<boolean> {
    assertTenantContext(context)
    const revoked = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .from(serviceAccounts)
      .where(
        and(
          eq(apiKeys.id, apiKeyId),
          eq(apiKeys.serviceAccountId, serviceAccounts.id),
          eq(serviceAccounts.organizationId, context.organizationId),
        ),
      )
      .returning({ id: apiKeys.id })
    if (!revoked[0]) return false
    await this.appendAuditEvent(context, {
      action: 'api_key.revoked',
      actorType: 'user',
      resourceId: apiKeyId,
      resourceType: 'api_key',
    })
    return true
  }

  async markApiKeyUsed(
    context: TenantContext,
    apiKeyId: string,
  ): Promise<void> {
    assertTenantContext(context)
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .from(serviceAccounts)
      .where(
        and(
          eq(apiKeys.id, apiKeyId),
          eq(apiKeys.serviceAccountId, serviceAccounts.id),
          eq(serviceAccounts.organizationId, context.organizationId),
        ),
      )
  }

  listAuditEvents(
    context: TenantContext,
    input: { cursor?: { id: string; occurredAt: Date }; limit: number },
  ) {
    assertTenantContext(context)
    return this.db
      .select({
        action: auditEvents.action,
        actorId: auditEvents.actorId,
        actorType: auditEvents.actorType,
        id: auditEvents.id,
        metadata: auditEvents.metadata,
        occurredAt: auditEvents.occurredAt,
        projectId: auditEvents.projectId,
        resourceId: auditEvents.resourceId,
        resourceType: auditEvents.resourceType,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, context.organizationId),
          ...(input.cursor
            ? [
                or(
                  lt(auditEvents.occurredAt, input.cursor.occurredAt),
                  and(
                    eq(auditEvents.occurredAt, input.cursor.occurredAt),
                    lt(auditEvents.id, input.cursor.id),
                  ),
                ),
              ]
            : []),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(input.limit)
  }

  async listProjectMemberships(
    context: TenantContext,
    projectId: string,
  ): Promise<AuthorizedProjectMembership[]> {
    assertTenantContext(context)
    return this.db
      .select({
        organizationId: projects.organizationId,
        projectId: projects.id,
        projectName: projects.name,
        roleKey: roles.key,
        userId: projectMemberships.userId,
      })
      .from(projectMemberships)
      .innerJoin(projects, eq(projectMemberships.projectId, projects.id))
      .leftJoin(roles, eq(projectMemberships.roleId, roles.id))
      .where(
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projects.organizationId, context.organizationId),
          eq(projectMemberships.organizationId, context.organizationId),
          eq(projectMemberships.status, 'active'),
        ),
      )
  }

  async upsertProjectMembership(
    projectId: string,
    userId: string,
    roleKey: string,
  ): Promise<AuthorizedProjectMembership> {
    const [project] = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        organizationId: projects.organizationId,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.status, 'active')))
      .limit(1)
    if (!project) throw new Error('Project was not found')

    const [organizationMembership] = await this.db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, project.organizationId),
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, 'active'),
        ),
      )
      .limit(1)
    if (!organizationMembership) {
      throw new Error('Project members must be active organization members')
    }

    const [role] = await this.db
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, project.organizationId),
          eq(roles.key, roleKey),
        ),
      )
      .limit(1)
    if (!role)
      throw new Error('Project role was not configured for organization')

    await this.db
      .insert(projectMemberships)
      .values({
        organizationId: project.organizationId,
        projectId: project.id,
        roleId: role.id,
        status: 'active',
        userId,
      })
      .onConflictDoUpdate({
        target: [projectMemberships.projectId, projectMemberships.userId],
        set: { roleId: role.id, status: 'active', updatedAt: new Date() },
      })

    return {
      organizationId: project.organizationId,
      projectId: project.id,
      projectName: project.name,
      roleKey: role.key,
      userId,
    }
  }

  async hasPermission(
    context: TenantContext,
    permission: string,
    projectId?: string,
  ): Promise<boolean> {
    assertTenantContext(context)
    const result = projectId
      ? await this.db
          .select({ permissionId: permissions.id })
          .from(projectMemberships)
          .innerJoin(roles, eq(projectMemberships.roleId, roles.id))
          .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
          .innerJoin(
            permissions,
            eq(rolePermissions.permissionId, permissions.id),
          )
          .where(
            and(
              eq(projectMemberships.organizationId, context.organizationId),
              eq(projectMemberships.projectId, projectId),
              eq(projectMemberships.userId, context.actorId),
              eq(projectMemberships.status, 'active'),
              eq(permissions.key, permission),
            ),
          )
          .limit(1)
      : await this.db
          .select({ permissionId: permissions.id })
          .from(organizationMemberships)
          .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
          .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
          .innerJoin(
            permissions,
            eq(rolePermissions.permissionId, permissions.id),
          )
          .where(
            and(
              eq(
                organizationMemberships.organizationId,
                context.organizationId,
              ),
              eq(organizationMemberships.userId, context.actorId),
              eq(organizationMemberships.status, 'active'),
              eq(permissions.key, permission),
            ),
          )
          .limit(1)

    return Boolean(result[0])
  }

  async appendAuditEvent(
    context: TenantContext,
    event: {
      action: string
      actorType: 'service_account' | 'system' | 'user'
      metadata?: Record<string, unknown>
      projectId?: string
      requestId?: string
      resourceId?: string
      resourceType: string
    },
  ): Promise<void> {
    assertTenantContext(context)
    await this.db.insert(auditEvents).values({
      action: event.action,
      actorId: context.actorId,
      actorType: event.actorType,
      metadata: event.metadata ?? {},
      organizationId: context.organizationId,
      ...(event.projectId ? { projectId: event.projectId } : {}),
      ...(event.requestId ? { requestId: event.requestId } : {}),
      ...(event.resourceId ? { resourceId: event.resourceId } : {}),
      resourceType: event.resourceType,
    })
  }
}
