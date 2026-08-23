import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BillingProjectionProcessor } from '../application/billing-projection.processor'
import type {
  BillingProvider,
  ProviderSubscription,
} from '../domain/billing.types'
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

  it('keeps a later account-wide snapshot when an earlier read finishes last', async () => {
    const earlierToken = await store.beginEntitlementSnapshot(billingAccountId)
    const laterToken = await store.beginEntitlementSnapshot(billingAccountId)
    const version = new Date('2026-08-23T15:00:00.000Z')
    await store.applySubscriptionSnapshot(
      billingAccountId,
      [],
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'later-subscription-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      laterToken,
    )
    await store.applySubscriptionSnapshot(
      billingAccountId,
      [],
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'stale-earlier-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      earlierToken,
    )

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([
      expect.objectContaining({ featureKey: 'later-subscription-grant' }),
    ])
  })

  it('persists all grants from one account-wide subscription snapshot', async () => {
    const token = await store.beginEntitlementSnapshot(billingAccountId)
    const version = new Date('2026-08-23T16:00:00.000Z')
    await store.applySubscriptionSnapshot(
      billingAccountId,
      [],
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'subscription-projects',
          providerUpdatedAt: version,
          source: 'subscription',
        },
        {
          active: true,
          billingAccountId,
          featureKey: 'subscription-exports',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      token,
    )

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements.map(
        (entitlement) => entitlement.featureKey,
      ),
    ).toEqual(['subscription-exports', 'subscription-projects'])
  })

  it('keeps every provider subscription grant when a webhook concerns one subscription', async () => {
    const subscriptions: ProviderSubscription[] = [
      subscription('subscription-webhook-a', 'subscription-projects'),
      subscription('subscription-webhook-b', 'subscription-exports'),
    ]
    const processor = new BillingProjectionProcessor(
      providerWithSubscriptions(() => Promise.resolve(subscriptions)),
      store,
    )
    const eventId = `event-${randomUUID()}`
    await store.insertEvent({
      createdAt: new Date('2026-08-23T17:00:00.000Z'),
      id: eventId,
      object: {
        customer: `customer-${organizationId}`,
        id: subscriptions[0]!.id,
      },
      provider: 'local',
      raw: JSON.stringify({
        data: {
          object: {
            customer: `customer-${organizationId}`,
            id: subscriptions[0]!.id,
          },
        },
      }),
      type: 'customer.subscription.updated',
    })

    await processor.process(eventId)

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements.map(
        (entitlement) => entitlement.featureKey,
      ),
    ).toEqual(['subscription-exports', 'subscription-projects'])
  })

  it('does not let a delayed earlier reconciliation overwrite a later snapshot', async () => {
    let releaseEarlierRead: (() => void) | undefined
    const earlierRead = new Promise<ProviderSubscription[]>((resolve) => {
      releaseEarlierRead = () =>
        resolve([
          subscription('subscription-race', 'stale-earlier-grant', {
            priceId: 'price_stale',
            status: 'canceled',
            // Stripe maps each provider list result when it resolves. This
            // later local timestamp must not let a stale token overwrite.
            updatedAt: new Date('2026-08-23T18:00:00.000Z'),
          }),
        ])
    })
    let signalEarlierRead: (() => void) | undefined
    const earlierReadStarted = new Promise<void>((resolve) => {
      signalEarlierRead = resolve
    })
    let reads = 0
    const processor = new BillingProjectionProcessor(
      providerWithSubscriptions(() => {
        reads += 1
        if (reads === 1) {
          signalEarlierRead?.()
          return earlierRead
        }
        return Promise.resolve([
          subscription('subscription-race', 'later-grant', {
            priceId: 'price_later',
            status: 'active',
            updatedAt: new Date('2026-08-23T17:00:00.000Z'),
          }),
        ])
      }),
      store,
    )

    const earlier = processor.reconcile(`customer-${organizationId}`)
    await earlierReadStarted
    await processor.reconcile(`customer-${organizationId}`)
    releaseEarlierRead?.()
    await earlier

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([expect.objectContaining({ featureKey: 'later-grant' })])
    expect(
      (await store.getSummaryForOrganization(organizationId)).subscriptions,
    ).toContainEqual(
      expect.objectContaining({
        priceId: 'price_later',
        providerSubscriptionId: 'subscription-race',
        status: 'active',
      }),
    )
  })

  it('preserves a non-subscription grant when a snapshot overlaps its feature key', async () => {
    const version = new Date('2026-08-23T18:00:00.000Z')
    await store.replaceEntitlements(
      billingAccountId,
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'provider-shared-grant',
          providerUpdatedAt: version,
          source: 'provider_entitlement',
        },
      ],
      version,
    )
    const token = await store.beginEntitlementSnapshot(billingAccountId)

    await store.applySubscriptionSnapshot(
      billingAccountId,
      [],
      [
        {
          active: true,
          billingAccountId,
          featureKey: 'provider-shared-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
        {
          active: true,
          billingAccountId,
          featureKey: 'subscription-only-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      token,
    )

    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([
      expect.objectContaining({
        featureKey: 'provider-shared-grant',
        source: 'provider_entitlement',
      }),
      expect.objectContaining({
        featureKey: 'subscription-only-grant',
        source: 'subscription',
      }),
    ])

    const emptyToken = await store.beginEntitlementSnapshot(billingAccountId)
    await store.applySubscriptionSnapshot(billingAccountId, [], [], emptyToken)
    expect(
      (await store.getSummaryForOrganization(organizationId)).entitlements,
    ).toEqual([
      expect.objectContaining({
        featureKey: 'provider-shared-grant',
        source: 'provider_entitlement',
      }),
    ])
  })
})

function subscription(
  id: string,
  entitlementKey: string,
  overrides: Partial<ProviderSubscription> = {},
): ProviderSubscription {
  return {
    cancelAtPeriodEnd: false,
    customerId: 'unused-by-test-provider',
    id,
    metadata: { entitlement_keys: entitlementKey },
    priceId: 'price_test',
    quantity: 1,
    status: 'active',
    updatedAt: new Date('2026-08-23T17:00:00.000Z'),
    ...overrides,
  }
}

function providerWithSubscriptions(
  listSubscriptions: (customerId: string) => Promise<ProviderSubscription[]>,
): BillingProvider {
  return {
    createCheckoutSession: () =>
      Promise.resolve({
        id: 'checkout',
        url: 'https://test',
      }),
    createCustomer: () => Promise.resolve({ id: 'customer' }),
    createPortalSession: () =>
      Promise.resolve({ id: 'portal', url: 'https://test' }),
    listSubscriptions,
    name: 'local',
    retrieveSubscription: () => Promise.resolve(null),
    verifyWebhook: () => {
      throw new Error('not used in projection tests')
    },
  }
}
