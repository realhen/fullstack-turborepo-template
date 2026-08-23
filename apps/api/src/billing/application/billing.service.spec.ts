import { createHmac } from 'node:crypto'
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { Principal } from '../../auth/domain/principal'
import { ControlledPlanCatalog } from './billing.catalog'
import { DisabledBillingProvider } from '../infrastructure/disabled-billing.provider'
import { BillingProjectionProcessor } from './billing-projection.processor'
import { BillingService } from './billing.service'
import {
  InMemoryBillingOrganizationMembershipStore,
  InMemoryBillingStore,
} from '../infrastructure/in-memory-billing.store'
import { LocalBillingProvider } from '../infrastructure/local-billing.provider'

const webhookSecret = 'test-webhook-secret'
const organizationId = 'organization_1'
const principal: Principal = {
  email: 'owner@example.com',
  id: 'user_1',
  provider: 'local',
  scopes: [],
}

function setup() {
  const provider = new LocalBillingProvider(webhookSecret)
  const store = new InMemoryBillingStore()
  const catalog = new ControlledPlanCatalog()
  const memberships = new InMemoryBillingOrganizationMembershipStore([
    { canManageBilling: true, organizationId, userId: principal.id },
  ])
  return {
    processor: new BillingProjectionProcessor(provider, store),
    provider,
    service: new BillingService(provider, store, store, memberships, catalog),
    store,
  }
}

function signedEvent(
  event: Record<string, unknown>,
  now = Math.floor(Date.now() / 1000),
) {
  const rawBody = Buffer.from(JSON.stringify(event))
  const signature = createHmac('sha256', webhookSecret)
    .update(`${now}.${rawBody.toString('utf8')}`, 'utf8')
    .digest('hex')
  return { rawBody, signature: `t=${now},v1=${signature}` }
}

describe('BillingService', () => {
  it('uses one stable provider idempotency key per organization', async () => {
    class RecordingProvider extends LocalBillingProvider {
      readonly createdCustomers: Array<{
        idempotencyKey: string | undefined
        input: { organizationId: string }
      }> = []

      override createCustomer(
        input: { organizationId: string },
        idempotencyKey?: string,
      ): Promise<{ id: string }> {
        this.createdCustomers.push({ idempotencyKey, input })
        return super.createCustomer(input, idempotencyKey ?? '')
      }
    }

    const provider = new RecordingProvider(webhookSecret)
    const store = new InMemoryBillingStore()
    const service = new BillingService(
      provider,
      store,
      store,
      new InMemoryBillingOrganizationMembershipStore([
        { canManageBilling: true, organizationId, userId: principal.id },
      ]),
      new ControlledPlanCatalog(),
    )

    await service.createCheckout({
      cancelUrl: 'https://app.example/cancel',
      organizationId,
      planCode: 'starter-monthly',
      principal: {
        id: principal.id,
        provider: principal.provider,
        scopes: principal.scopes,
      },
      requestId: 'request-1',
      successUrl: 'https://app.example/success',
    })

    expect(provider.createdCustomers).toEqual([
      {
        idempotencyKey: 'billing-customer:organization_1',
        input: { organizationId: 'organization_1' },
      },
    ])
  })

  it('creates local checkout and portal sessions without granting redirect authority', async () => {
    const { service, store } = setup()
    const checkout = await service.createCheckout({
      cancelUrl: 'http://localhost:3000/billing/cancel',
      organizationId,
      planCode: 'pro-monthly',
      principal,
      successUrl: 'http://localhost:3000/billing/success',
    })
    const portal = await service.createPortal({
      organizationId,
      principal,
      returnUrl: 'http://localhost:3000/settings/billing',
    })

    expect(checkout.url).toMatch(/^https:\/\/local\.billing\.test\/checkout\//)
    expect(portal.url).toContain('/portal/local_cus_organization_1')
    expect(store.subscriptions).toHaveLength(0)
    expect(
      store.accountsByOrganization.get(organizationId)?.providerCustomerId,
    ).toBe('local_cus_organization_1')
  })

  it('rejects billing operations without organization billing authority', async () => {
    const { service } = setup()
    await expect(
      service.createCheckout({
        cancelUrl: 'http://localhost:3000/cancel',
        organizationId: 'organization_without_billing_access',
        planCode: 'starter-monthly',
        principal,
        successUrl: 'http://localhost:3000/success',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('keeps deployments usable when billing is disabled', async () => {
    const store = new InMemoryBillingStore()
    const memberships = new InMemoryBillingOrganizationMembershipStore([
      { canManageBilling: true, organizationId, userId: principal.id },
    ])
    const service = new BillingService(
      new DisabledBillingProvider(),
      store,
      store,
      memberships,
      new ControlledPlanCatalog(),
    )

    await expect(
      service.createCheckout({
        cancelUrl: 'http://localhost:3000/cancel',
        organizationId,
        planCode: 'starter-monthly',
        principal,
        successUrl: 'http://localhost:3000/success',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('rejects an invalid webhook signature before creating an inbox record', async () => {
    const { service, store } = setup()
    const rawBody = Buffer.from(
      JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'sub_1' } },
        id: 'evt_invalid',
        type: 'customer.subscription.updated',
      }),
    )

    await expect(
      service.ingestWebhook(rawBody, 't=1,v1=incorrect'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(store.events).toHaveLength(0)
  })

  it('deduplicates receipts and projects current provider state when events are stale', async () => {
    const { processor, provider, service, store } = setup()
    await service.createCheckout({
      cancelUrl: 'http://localhost:3000/cancel',
      organizationId,
      planCode: 'pro-monthly',
      principal,
      successUrl: 'http://localhost:3000/success',
    })
    const subscription = [...provider.subscriptions.values()][0]
    expect(subscription).toBeDefined()
    if (!subscription) throw new Error('Expected local subscription')
    provider.subscriptions.set(subscription.id, {
      ...subscription,
      status: 'canceled',
      updatedAt: new Date(),
    })
    const event = {
      created: Math.floor(Date.now() / 1000) - 60,
      data: {
        object: {
          customer: subscription.customerId,
          id: subscription.id,
          status: 'active',
        },
      },
      id: 'evt_subscription_stale',
      type: 'customer.subscription.updated',
    }
    const { rawBody, signature } = signedEvent(event)

    await expect(service.ingestWebhook(rawBody, signature)).resolves.toEqual({
      duplicate: false,
      eventId: 'evt_subscription_stale',
    })
    await expect(service.ingestWebhook(rawBody, signature)).resolves.toEqual({
      duplicate: true,
      eventId: 'evt_subscription_stale',
    })
    expect(store.messages).toContainEqual({
      eventId: 'evt_subscription_stale',
      kind: 'billing.webhook',
    })
    await processor.process('evt_subscription_stale')

    expect(store.subscriptions.get(subscription.id)?.status).toBe('canceled')
    expect(
      store.entitlements.get(
        store.accountsByOrganization.get(organizationId)?.id ?? '',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ active: false, featureKey: 'exports' }),
      ]),
    )
    expect(store.processedEvents.has('evt_subscription_stale')).toBe(true)
  })

  it('reconciliation clears a baseline entitlement projection when the provider has no subscriptions', async () => {
    const { processor, service, store } = setup()
    await service.createPortal({
      organizationId,
      principal,
      returnUrl: 'http://localhost:3000/settings/billing',
    })
    const account = store.accountsByOrganization.get(organizationId)
    expect(account).toBeDefined()
    if (!account) throw new Error('Expected billing account')
    const baselineVersion = new Date(Date.now() - 60_000)
    await store.replaceEntitlements(
      account.id,
      [
        {
          active: true,
          billingAccountId: account.id,
          featureKey: 'legacy-access',
          providerUpdatedAt: baselineVersion,
          source: 'subscription',
        },
      ],
      baselineVersion,
    )

    await processor.reconcile(account.providerCustomerId)

    expect(store.entitlements.get(account.id)).toEqual([])
    expect(
      store.entitlementProjectionVersions.get(account.id)?.getTime(),
    ).toBeGreaterThan(baselineVersion.getTime())
  })

  it('reconciliation combines entitlement keys from every current subscription', async () => {
    const { processor, service, store } = setup()
    for (const planCode of ['starter-monthly', 'pro-monthly']) {
      await service.createCheckout({
        cancelUrl: 'http://localhost:3000/cancel',
        organizationId,
        planCode,
        principal,
        successUrl: 'http://localhost:3000/success',
      })
    }
    const account = store.accountsByOrganization.get(organizationId)
    expect(account).toBeDefined()
    if (!account) throw new Error('Expected billing account')

    await processor.reconcile(account.providerCustomerId)

    expect(
      store.entitlements
        .get(account.id)
        ?.map((entitlement) => entitlement.featureKey)
        .sort(),
    ).toEqual(['exports', 'projects'])
  })
})
