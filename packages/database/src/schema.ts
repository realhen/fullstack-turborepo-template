import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email'),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('users_email_unique')
      .on(table.email)
      .where(sql`${table.email} IS NOT NULL`),
  ],
)

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    provider: text('provider').notNull(),
    connectionId: text('connection_id'),
    emailSnapshot: text('email_snapshot'),
    emailVerified: boolean('email_verified').notNull().default(false),
    lastAuthenticatedAt: timestamp('last_authenticated_at', {
      withTimezone: true,
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('external_identities_issuer_subject_unique').on(
      table.issuer,
      table.subject,
    ),
    index('external_identities_user_id_idx').on(table.userId),
  ],
)

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
)

export const organizationDomains = pgTable(
  'organization_domains',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    source: text('source').notNull().default('manual'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_domains_domain_unique').on(table.domain),
    index('organization_domains_organization_idx').on(table.organizationId),
  ],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('projects_organization_slug_unique').on(
      table.organizationId,
      table.slug,
    ),
    uniqueIndex('projects_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    index('projects_organization_idx').on(table.organizationId),
  ],
)

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
  ...timestamps(),
})

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    system: boolean('system').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('roles_global_key_unique')
      .on(table.key)
      .where(sql`${table.organizationId} IS NULL AND ${table.projectId} IS NULL`),
    uniqueIndex('roles_organization_key_unique')
      .on(table.organizationId, table.key)
      .where(sql`${table.organizationId} IS NOT NULL AND ${table.projectId} IS NULL`),
    uniqueIndex('roles_project_key_unique')
      .on(table.projectId, table.key)
      .where(sql`${table.projectId} IS NOT NULL`),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('role_permissions_role_permission_unique').on(
      table.roleId,
      table.permissionId,
    ),
  ],
)

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_memberships_organization_user_unique').on(
      table.organizationId,
      table.userId,
    ),
    index('organization_memberships_user_idx').on(table.userId),
  ],
)

export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_memberships_project_user_unique').on(
      table.projectId,
      table.userId,
    ),
    index('project_memberships_organization_user_idx').on(
      table.organizationId,
      table.userId,
    ),
  ],
)

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    email: text('email').notNull(),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('invitations_organization_email_idx').on(
      table.organizationId,
      table.email,
    ),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    ...timestamps(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
)

export const serviceAccounts = pgTable(
  'service_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [index('service_accounts_organization_idx').on(table.organizationId)],
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'cascade' }),
    prefix: text('prefix').notNull().unique(),
    secretHash: text('secret_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('api_keys_service_account_idx').on(table.serviceAccountId)],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_events_organization_occurred_idx').on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
)

export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
  },
  (table) => [
    uniqueIndex('webhook_inbox_provider_event_unique').on(
      table.provider,
      table.eventId,
    ),
  ],
)

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('outbox_pending_idx').on(table.availableAt)],
)
