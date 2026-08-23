import { Inject, Injectable } from '@nestjs/common'
import {
  BILLING_PROVIDER,
  BILLING_REPOSITORY,
  type BillingAccount,
  type BillingProvider,
  type BillingRepository,
  type EntitlementProjection,
  type ProviderSubscription,
} from './billing.types'

@Injectable()
export class BillingProjectionProcessor {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
  ) {}

  async process(eventId: string): Promise<void> {
    const event = await this.repository.getEvent(eventId)
    if (!event) return
    try {
      if (event.type.startsWith('customer.subscription.')) {
        await this.projectSubscriptionEvent(event.object, event.createdAt)
      } else if (event.type.startsWith('invoice.')) {
        await this.projectInvoiceEvent(event.object, event.createdAt)
      } else if (event.type === 'entitlements.active_entitlement_summary.updated') {
        await this.projectEntitlementEvent(event.object, event.createdAt)
      }
      await this.repository.markEventProcessed(eventId)
    } catch (error) {
      await this.repository.markEventFailed(
        eventId,
        error instanceof Error ? error.message : 'Unknown billing projection error',
      )
      throw error
    }
  }

  async reconcile(customerId: string): Promise<void> {
    const account = await this.repository.findAccountByCustomer(customerId)
    if (!account) return
    const subscriptions = await this.provider.listSubscriptions(customerId)
    for (const subscription of subscriptions) {
      await this.projectSubscription(account, subscription)
    }
  }

  private async projectSubscriptionEvent(
    object: Record<string, unknown>,
    providerEventCreatedAt: Date,
  ): Promise<void> {
    const subscriptionId = stringAt(object, 'id')
    const customerId = stringAt(object, 'customer')
    if (!subscriptionId || !customerId) return
    const account = await this.repository.findAccountByCustomer(customerId)
    if (!account) return
    // Stripe events are unordered. Retrieve the present provider state instead
    // of trusting this possibly stale snapshot.
    const subscription = await this.provider.retrieveSubscription(subscriptionId)
    if (subscription) {
      await this.projectSubscription(account, subscription, providerEventCreatedAt)
    }
  }

  private async projectSubscription(
    account: BillingAccount,
    subscription: ProviderSubscription,
    providerUpdatedAt = subscription.updatedAt,
  ): Promise<void> {
    await this.repository.upsertSubscription({
      billingAccountId: account.id,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      ...(subscription.currentPeriodEnd
        ? { currentPeriodEnd: subscription.currentPeriodEnd }
        : {}),
      priceId: subscription.priceId,
      providerSubscriptionId: subscription.id,
      providerUpdatedAt,
      quantity: subscription.quantity,
      status: subscription.status,
    })
    const active = ['active', 'trialing'].includes(subscription.status)
    const entitlementKeys = parseEntitlementKeys(subscription.metadata)
    await this.repository.replaceEntitlements(
      account.id,
      entitlementKeys.map((featureKey) => ({
        active,
        billingAccountId: account.id,
        featureKey,
        providerUpdatedAt,
        source: 'subscription',
      })),
    )
  }

  private async projectInvoiceEvent(
    object: Record<string, unknown>,
    createdAt: Date,
  ): Promise<void> {
    const customerId = stringAt(object, 'customer')
    const invoiceId = stringAt(object, 'id')
    if (!customerId || !invoiceId) return
    const account = await this.repository.findAccountByCustomer(customerId)
    if (!account) return
    await this.repository.upsertInvoice({
      amountDue: numberAt(object, 'amount_due') ?? 0,
      amountPaid: numberAt(object, 'amount_paid') ?? 0,
      billingAccountId: account.id,
      currency: stringAt(object, 'currency') ?? 'usd',
      ...(stringAt(object, 'hosted_invoice_url')
        ? { hostedInvoiceUrl: stringAt(object, 'hosted_invoice_url') }
        : {}),
      ...(stringAt(object, 'invoice_pdf')
        ? { invoicePdf: stringAt(object, 'invoice_pdf') }
        : {}),
      providerInvoiceId: invoiceId,
      ...(stringAt(object, 'subscription')
        ? { providerSubscriptionId: stringAt(object, 'subscription') }
        : {}),
      providerUpdatedAt: createdAt,
      status: stringAt(object, 'status') ?? 'unknown',
    })
  }

  private async projectEntitlementEvent(
    object: Record<string, unknown>,
    createdAt: Date,
  ): Promise<void> {
    const customerId = stringAt(object, 'customer')
    if (!customerId) return
    const account = await this.repository.findAccountByCustomer(customerId)
    if (!account) return
    const entitlements = Array.isArray(object.entitlements)
      ? object.entitlements
      : []
    const projected: EntitlementProjection[] = entitlements.flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const entitlement = value as Record<string, unknown>
      const featureKey = stringAt(entitlement, 'lookup_key')
      if (!featureKey) return []
      return [
        {
          active: true,
          billingAccountId: account.id,
          featureKey,
          providerUpdatedAt: createdAt,
          source: 'provider_entitlement',
        },
      ]
    })
    await this.repository.replaceEntitlements(account.id, projected)
  }
}

function parseEntitlementKeys(metadata: Record<string, string>): string[] {
  return (metadata.entitlement_keys ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
}

function stringAt(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key]
  return typeof value === 'string' ? value : undefined
}

function numberAt(object: Record<string, unknown>, key: string): number | undefined {
  const value = object[key]
  return typeof value === 'number' ? value : undefined
}
