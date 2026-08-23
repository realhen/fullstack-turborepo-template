import type { Pool, PoolClient } from 'pg'

export type PreTenantProjectMembership = {
  organizationId: string
  projectId: string
  projectName: string
  roleKey: string | null
  userId: string
}

export type PreTenantOrganizationMembership = {
  id: string
  name: string
  role: string | null
  slug: string
}

export type PreTenantInvitation = {
  acceptedAt: Date | null
  email: string
  expiresAt: Date
  id: string
  organizationId: string
  projectId: string | null
  revokedAt: Date | null
  roleId: string | null
}

export type PreTenantApiKey = {
  apiKeyId: string
  expiresAt: Date | null
  organizationId: string
  projectId: string | null
  revokedAt: Date | null
  scopes: string[]
  secretHash: string
  serviceAccountId: string
  serviceAccountStatus: string
}

/**
 * Uses the three audited SECURITY DEFINER functions created by migration 0001.
 * It deliberately exposes no arbitrary table/query access before a tenant has
 * been authorized. Every resource operation must follow withTenantTransaction.
 */
export class PreTenantAuthorizationLookup {
  constructor(private readonly pool: Pool) {}

  resolveProjectMembership(
    projectId: string,
    userId: string,
  ): Promise<PreTenantProjectMembership | null> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{
        organization_id: string
        project_id: string
        project_name: string
        role_key: string | null
        user_id: string
      }>(
        'SELECT * FROM resolve_authorized_project_membership($1::uuid, $2::uuid)',
        [projectId, userId],
      )
      const row = result.rows[0]
      return row
        ? {
            organizationId: row.organization_id,
            projectId: row.project_id,
            projectName: row.project_name,
            roleKey: row.role_key,
            userId: row.user_id,
          }
        : null
    })
  }

  listOrganizations(userId: string): Promise<PreTenantOrganizationMembership[]> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{
        id: string
        name: string
        role_key: string | null
        slug: string
      }>('SELECT * FROM list_authorized_organizations($1::uuid)', [userId])
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role_key,
        slug: row.slug,
      }))
    })
  }

  resolveLinkedUserId(issuer: string, subject: string): Promise<string | null> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{ user_id: string | null }>(
        'SELECT resolve_linked_user_id($1, $2) AS user_id',
        [issuer, subject],
      )
      return result.rows[0]?.user_id ?? null
    })
  }

  provisionLinkedUser(input: {
    email: string
    issuer: string
    provider: string
    subject: string
  }): Promise<string> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{ user_id: string }>(
        'SELECT provision_external_identity($1, $2, $3, $4) AS user_id',
        [input.issuer, input.subject, input.provider, input.email],
      )
      const userId = result.rows[0]?.user_id
      if (!userId) throw new Error('Identity provisioning did not return a user')
      return userId
    })
  }

  resolveInvitation(tokenHash: string): Promise<PreTenantInvitation | null> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{
        accepted_at: Date | null
        email: string
        expires_at: Date
        invitation_id: string
        organization_id: string
        project_id: string | null
        revoked_at: Date | null
        role_id: string | null
      }>('SELECT * FROM resolve_invitation_token($1)', [tokenHash])
      const row = result.rows[0]
      return row
        ? {
            acceptedAt: row.accepted_at,
            email: row.email,
            expiresAt: row.expires_at,
            id: row.invitation_id,
            organizationId: row.organization_id,
            projectId: row.project_id,
            revokedAt: row.revoked_at,
            roleId: row.role_id,
          }
        : null
    })
  }

  resolveApiKey(prefix: string): Promise<PreTenantApiKey | null> {
    return this.withRuntimeRole(async (client) => {
      const result = await client.query<{
        api_key_id: string
        expires_at: Date | null
        organization_id: string
        project_id: string | null
        revoked_at: Date | null
        scopes: string[]
        secret_hash: string
        service_account_id: string
        service_account_status: string
      }>('SELECT * FROM resolve_api_key_prefix($1)', [prefix])
      const row = result.rows[0]
      return row
        ? {
            apiKeyId: row.api_key_id,
            expiresAt: row.expires_at,
            organizationId: row.organization_id,
            projectId: row.project_id,
            revokedAt: row.revoked_at,
            scopes: row.scopes,
            secretHash: row.secret_hash,
            serviceAccountId: row.service_account_id,
            serviceAccountStatus: row.service_account_status,
          }
        : null
    })
  }

  private async withRuntimeRole<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE saas_runtime')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
}
