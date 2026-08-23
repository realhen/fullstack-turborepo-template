import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresBillingStore } from './database-billing.store'

const databaseUrl = process.env.DATABASE_RLS_TEST_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('PostgresBillingStore integration', () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const store = new PostgresBillingStore(pool)
  const organizationId = randomUUID()
  const billingAccountId = `billing-integration-${randomUUID()}`

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO organizations (id, slug, name)
       VALUES ($1, $2, 'Billing integration test')`,
      [organizationId, `billing-${organizationId.slice(0, 8)}`],
    )
    await store.createAccount({
      createdAt: new Date(),
      id: billingAccountId,
      organizationId,
      provider: 'local',
      providerCustomerId: `customer-${organizationId}`,
    })
  })

  afterAll(async () => {
    await pool.query('DELETE FROM organizations WHERE id = $1', [
      organizationId,
    ])
    await pool.end()
  })

  it('does not replace a newer entitlement projection with a stale event', async () => {
    const newer = new Date('2026-08-23T12:00:00.000Z')
    await store.replaceEntitlements(
      billingAccountId,
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'new-feature',
          providerUpdatedAt: newer,
          source: 'subscription',
        },
      ],
      newer,
    )
    await store.replaceEntitlements(
      billingAccountId,
      [
        {
          active: false,
          billingAccountId,
          featureKey: 'stale-feature',
          providerUpdatedAt: new Date('2026-08-23T11:00:00.000Z'),
          source: 'subscription',
        },
      ],
      new Date('2026-08-23T11:00:00.000Z'),
    )

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([
      expect.objectContaining({ active: true, featureKey: 'new-feature' }),
    ])
  })

  it('persists an empty projection version and rejects stale or equal restoration', async () => {
    const newer = new Date('2026-08-23T14:00:00.000Z')
    await store.replaceEntitlements(billingAccountId, [], newer)
    for (const version of [
      new Date('2026-08-23T13:00:00.000Z'),
      new Date('2026-08-23T14:00:00.000Z'),
    ]) {
      await store.replaceEntitlements(
        billingAccountId,
        [
          {
            active: true,
            billingAccountId,
            featureKey: 'stale-feature',
            providerUpdatedAt: version,
            source: 'subscription',
          },
        ],
        version,
      )
    }
    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([])
  })
})
