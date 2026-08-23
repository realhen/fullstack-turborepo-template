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

  it('retains an empty newer projection against stale or equal restoration', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-2'
    const newer = new Date('2026-08-23T12:00:00.000Z')
    await store.replaceEntitlements(accountId, [], newer)
    for (const version of [
      new Date('2026-08-23T11:00:00.000Z'),
      new Date('2026-08-23T12:00:00.000Z'),
    ]) {
      await store.replaceEntitlements(
        accountId,
        [
          {
            active: true,
            billingAccountId: accountId,
            featureKey: 'stale-feature',
            providerUpdatedAt: version,
            source: 'subscription',
          },
        ],
        version,
      )
    }
    expect(store.entitlements.get(accountId)).toEqual([])
  })

  it('accepts a strictly newer entitlement projection after an empty projection', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-3'
    await store.replaceEntitlements(
      accountId,
      [],
      new Date('2026-08-23T12:00:00.000Z'),
    )
    await store.replaceEntitlements(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'new-feature',
          providerUpdatedAt: new Date('2026-08-23T12:01:00.000Z'),
          source: 'subscription',
        },
      ],
      new Date('2026-08-23T12:01:00.000Z'),
    )
    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({ featureKey: 'new-feature' }),
    ])
  })

  it('rejects an earlier snapshot that finishes after a later one', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-snapshot'
    const earlier = await store.beginEntitlementSnapshot(accountId)
    const later = await store.beginEntitlementSnapshot(accountId)
    const version = new Date('2026-08-23T12:00:00.000Z')
    await store.replaceEntitlementsFromSnapshot(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'later',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      later,
    )
    await store.replaceEntitlementsFromSnapshot(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'earlier',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      earlier,
    )

    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({ featureKey: 'later' }),
    ])
  })

  it('clears only subscription-derived grants for an empty snapshot', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-source-aware-snapshot'
    const version = new Date('2026-08-23T13:00:00.000Z')
    await store.replaceEntitlements(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'provider-grant',
          providerUpdatedAt: version,
          source: 'provider_entitlement',
        },
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'subscription-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      version,
    )
    const token = await store.beginEntitlementSnapshot(accountId)

    await store.replaceEntitlementsFromSnapshot(accountId, [], token)

    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({
        featureKey: 'provider-grant',
        source: 'provider_entitlement',
      }),
    ])
  })

  it('preserves a non-subscription grant when a snapshot has the same feature key', async () => {
    const store = new InMemoryBillingStore()
    const accountId = 'billing-account-overlapping-source'
    const version = new Date('2026-08-23T14:00:00.000Z')
    await store.replaceEntitlements(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'shared-grant',
          providerUpdatedAt: version,
          source: 'provider_entitlement',
        },
      ],
      version,
    )
    const token = await store.beginEntitlementSnapshot(accountId)

    await store.replaceEntitlementsFromSnapshot(
      accountId,
      [
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'shared-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
        {
          active: true,
          billingAccountId: accountId,
          featureKey: 'subscription-only-grant',
          providerUpdatedAt: version,
          source: 'subscription',
        },
      ],
      token,
    )

    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({
        featureKey: 'shared-grant',
        source: 'provider_entitlement',
      }),
      expect.objectContaining({
        featureKey: 'subscription-only-grant',
        source: 'subscription',
      }),
    ])

    const emptyToken = await store.beginEntitlementSnapshot(accountId)
    await store.replaceEntitlementsFromSnapshot(accountId, [], emptyToken)
    expect(store.entitlements.get(accountId)).toEqual([
      expect.objectContaining({
        featureKey: 'shared-grant',
        source: 'provider_entitlement',
      }),
    ])
  })
})
