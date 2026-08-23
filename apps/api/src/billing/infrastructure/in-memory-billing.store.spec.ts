import { describe, expect, it } from 'vitest'
import { InMemoryBillingStore } from './in-memory-billing.store'

describe('InMemoryBillingStore entitlements', () => {
  it('retains a newer entitlement projection when a stale replacement arrives', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-1'
    const newer = new Date('2026-08-23T12:00:00.000Z')

    await store.replaceEntitlements(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'projects',
          providerUpdatedAt: newer,
          source: 'subscription',
        },
      ],
      newer,
    )
    await store.replaceEntitlements(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'exports',
          providerUpdatedAt: new Date('2026-08-23T11:00:00.000Z'),
          source: 'subscription',
        },
      ],
      new Date('2026-08-23T11:00:00.000Z'),
    )

    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({ featureKey: 'projects' }),
    ])
  })
})
