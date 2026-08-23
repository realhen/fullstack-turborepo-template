import { Pool } from 'pg'
import { requireDatabaseUrl } from './connection-string'

const localOrganizationId = '00000000-0000-4000-8000-000000000001'
const localProjectId = '00000000-0000-4000-8000-000000000002'
const localUserId = '00000000-0000-4000-8000-000000000003'
const ownerRoleId = '00000000-0000-4000-8000-000000000004'
function requireLocalSeedUrl(): string {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DATABASE_SEED_LOCAL !== 'true'
  ) {
    throw new Error(
      'Seeding requires NODE_ENV != production and DATABASE_SEED_LOCAL=true',
    )
  }
  return requireDatabaseUrl()
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: requireLocalSeedUrl() })
  const client = await pool.connect()
  const subject = process.env.AUTH_LOCAL_SUBJECT ?? 'local-developer'
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (id, email, display_name)
       VALUES ($1, 'local@example.test', 'Local Developer')
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      [localUserId],
    )
    await client.query(
      `INSERT INTO external_identities (user_id, issuer, subject, provider, email_snapshot, email_verified)
       VALUES ($1, 'local', $2, 'local', 'local@example.test', true)
       ON CONFLICT (issuer, subject) DO UPDATE
         SET user_id = EXCLUDED.user_id, last_authenticated_at = now(), updated_at = now()`,
      [localUserId, subject],
    )
    await client.query(
      `INSERT INTO permissions (key, description) VALUES
         ('organizations:read', 'List organizations available to the principal'),
         ('members:invite', 'Invite organization or project members'),
         ('members:manage', 'Manage organization or project members'),
         ('projects:read', 'Read project resources'),
         ('projects:write', 'Modify project resources'),
         ('projects:members:manage', 'Manage project memberships'),
         ('billing:manage', 'Manage organization billing'),
         ('api_keys:manage', 'Manage service-account API keys'),
         ('audit:read', 'Read organization audit events')
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
    )
    await client.query('SET LOCAL ROLE saas_runtime')
    await client.query(
      `SELECT set_config('app.organization_id', $1, true),
              set_config('app.actor_id', $2, true)`,
      [localOrganizationId, localUserId],
    )
    await client.query(
      `INSERT INTO organizations (id, slug, name)
       VALUES ($1, 'local-org', 'Local organization')
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      [localOrganizationId],
    )
    await client.query(
      `INSERT INTO projects (id, organization_id, slug, name)
       VALUES ($1, $2, 'local-project', 'Local project')
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      [localProjectId, localOrganizationId],
    )
    await client.query(
      `INSERT INTO roles (id, organization_id, key, name, system)
       VALUES ($1, $2, 'owner', 'Owner', true)
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      [ownerRoleId, localOrganizationId],
    )
    await client.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now()`,
      [localOrganizationId, localUserId, ownerRoleId],
    )
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions
       WHERE key = ANY($2::text[])
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [
        ownerRoleId,
        [
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
      ],
    )
    await client.query(
      `INSERT INTO project_memberships (organization_id, project_id, user_id, role_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE
         SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now()`,
      [localOrganizationId, localProjectId, localUserId, ownerRoleId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((error: unknown) => {
  console.error('Database seed failed', error)
  process.exitCode = 1
})
