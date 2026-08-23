import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_RLS_TEST_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const migration = readFileSync(
  path.join(
    process.cwd(),
    'migrations/0004_billing_entitlement_projection_versions.sql',
  ),
  'utf8',
)

describeDatabase('migration 0004 pre-release baseline', () => {
  const pool = new Pool({ connectionString: databaseUrl })

  afterAll(async () => {
    await pool.end()
  })

  it('records every existing account and queues one reconciliation per account', async () => {
    const accountWithEntitlements = `baseline-account-${randomUUID()}`
    const accountWithoutEntitlements = `baseline-account-${randomUUID()}`
    const organizationWithEntitlements = randomUUID()
    const organizationWithoutEntitlements = randomUUID()
    const entitlementVersion = new Date('2026-08-01T00:00:00.000Z')
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query('DROP TABLE billing_entitlement_projection_versions')
      await client.query(
        `INSERT INTO organizations (id, slug, name)
         VALUES ($1, $2, 'Baseline organization one'),
                ($3, $4, 'Baseline organization two')`,
        [
          organizationWithEntitlements,
          `baseline-${organizationWithEntitlements.slice(0, 8)}`,
          organizationWithoutEntitlements,
          `baseline-${organizationWithoutEntitlements.slice(0, 8)}`,
        ],
      )
      await client.query(
        `INSERT INTO billing_accounts
           (id, organization_id, provider, provider_customer_id)
         VALUES ($1, $2, 'local', $3), ($4, $5, 'local', $6)`,
        [
          accountWithEntitlements,
          organizationWithEntitlements,
          `customer-${accountWithEntitlements}`,
          accountWithoutEntitlements,
          organizationWithoutEntitlements,
          `customer-${accountWithoutEntitlements}`,
        ],
      )
      await client.query(
        `INSERT INTO billing_entitlements
           (billing_account_id, feature_key, active, source, provider_updated_at)
         VALUES ($1, 'baseline-feature', true, 'manual', $2)`,
        [accountWithEntitlements, entitlementVersion],
      )

      await client.query(migration)

      const versions = await client.query<{
        billing_account_id: string
        provider_updated_at: Date
      }>(
        `SELECT billing_account_id, provider_updated_at
         FROM billing_entitlement_projection_versions
         WHERE billing_account_id = ANY($1::text[])
         ORDER BY billing_account_id`,
        [[accountWithEntitlements, accountWithoutEntitlements]],
      )
      expect(versions.rows).toHaveLength(2)
      expect(
        versions.rows
          .find(
            (version) => version.billing_account_id === accountWithEntitlements,
          )
          ?.provider_updated_at.toISOString(),
      ).toBe(entitlementVersion.toISOString())
      expect(
        versions.rows
          .find(
            (version) =>
              version.billing_account_id === accountWithoutEntitlements,
          )
          ?.provider_updated_at.toISOString(),
      ).toBe('1970-01-01T00:00:00.000Z')

      const reconciliations = await client.query<{
        customer_id: string
      }>(
        `SELECT payload ->> 'customerId' AS customer_id
         FROM billing_outbox
         WHERE topic = 'billing.reconcile'
           AND payload ->> 'customerId' = ANY($1::text[])
         ORDER BY customer_id`,
        [
          [
            `customer-${accountWithEntitlements}`,
            `customer-${accountWithoutEntitlements}`,
          ],
        ],
      )
      expect(reconciliations.rows.map((row) => row.customer_id)).toEqual(
        [
          `customer-${accountWithEntitlements}`,
          `customer-${accountWithoutEntitlements}`,
        ].sort(),
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
