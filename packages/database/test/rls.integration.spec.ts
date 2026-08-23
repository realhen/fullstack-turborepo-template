import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const rlsTestUrl = process.env.DATABASE_RLS_TEST_URL ?? ''

describe('tenant row-level security', () => {
  let pool: Pool

  beforeAll(async () => {
    if (rlsTestUrl) pool = new Pool({ connectionString: rlsTestUrl })
  })

  afterAll(async () => {
    await pool?.end()
  })

  it.skipIf(!rlsTestUrl)(
    'resolves membership before tenant context, then denies a cross-tenant project',
    async () => {
      const organizationA = randomUUID()
      const organizationB = randomUUID()
      const projectA = randomUUID()
      const roleA = randomUUID()
      const userA = randomUUID()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          "INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'RLS User')",
          [userA, `rls-${userA.slice(0, 8)}@example.test`],
        )
        await client.query('SET LOCAL ROLE saas_runtime')
        await client.query(
          `SELECT set_config('app.organization_id', $1, true),
                  set_config('app.actor_id', $2, true)`,
          [organizationA, randomUUID()],
        )
        await client.query(
          "INSERT INTO organizations (id, slug, name) VALUES ($1, $2, 'RLS A')",
          [organizationA, `rls-${organizationA.slice(0, 8)}`],
        )
        await client.query(
          "INSERT INTO projects (id, organization_id, slug, name) VALUES ($1, $2, 'project-a', 'Project A')",
          [projectA, organizationA],
        )
        await client.query(
          "INSERT INTO roles (id, organization_id, key, name) VALUES ($1, $2, 'viewer', 'Viewer')",
          [roleA, organizationA],
        )
        await client.query(
          'INSERT INTO organization_memberships (organization_id, user_id, role_id) VALUES ($1, $2, $3)',
          [organizationA, userA, roleA],
        )
        await client.query(
          'INSERT INTO project_memberships (organization_id, project_id, user_id, role_id) VALUES ($1, $2, $3, $4)',
          [organizationA, projectA, userA, roleA],
        )
        await client.query(
          `SELECT set_config('app.organization_id', '', true),
                  set_config('app.actor_id', '', true)`,
        )
        await expect(
          client.query(
            'SELECT * FROM resolve_authorized_project_membership($1, $2)',
            [projectA, userA],
          ),
        ).resolves.toMatchObject({ rowCount: 1 })
        await client.query(
          `SELECT set_config('app.organization_id', $1, true),
                  set_config('app.actor_id', $2, true)`,
          [organizationB, randomUUID()],
        )

        await expect(
          client.query('SELECT id FROM projects WHERE id = $1', [projectA]),
        ).resolves.toMatchObject({ rowCount: 0 })
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    },
  )
})
