/**
 * Provider-neutral billing contracts. Financial records remain authoritative
 * at the provider; these records are intentionally projections for access and
 * operational workflows.
 */
export type BillingProviderName = 'disabled' | 'local' | 'stripe'

export type BillingPlan = {
  code: string
  displayName: string
  stripePriceId?: string
  localPriceId: string
  interval: 'month' | 'year'
  entitlementKeys: readonly string[]
}

export type BillingAccount = {
  id: string
  organizationId: string
  provider: BillingProviderName
  providerCustomerId: string
  createdAt: Date
}

export type BillingSubscription = {
  providerSubscriptionId: string
  billingAccountId: string
  status: string
  priceId: string
  quantity: number
  currentPeriodEnd?: Date
  cancelAtPeriodEnd: boolean
  providerUpdatedAt: Date
}

export type BillingInvoice = {
  providerInvoiceId: string
  billingAccountId: string
  providerSubscriptionId?: string
  status: string
  amountDue: number
  amountPaid: number
  currency: string
  hostedInvoiceUrl?: string
  invoicePdf?: string
  providerUpdatedAt: Date
}

export type BillingEntitlement = {
  billingAccountId: string
  featureKey: string
  active: boolean
  source: 'subscription' | 'provider_entitlement' | 'manual'
  providerUpdatedAt: Date
}

export type BillingCheckoutRequest = {
  customerId: string
  plan: BillingPlan
  quantity: number
  successUrl: string
  cancelUrl: string
  correlationId: string
  metadata: Record<string, string>
}

export type BillingCheckoutSession = {
  id: string
  url: string
  providerCustomerId: string
}

export type BillingPortalSession = {
  id: string
  url: string
}

export type VerifiedBillingEvent = {
  id: string
  type: string
  createdAt: Date
  provider: BillingProviderName
  object: Record<string, unknown>
  raw: string
}

export interface BillingProvider {
  readonly name: BillingProviderName
  createCustomer(input: {
    organizationId: string
    email?: string
  }): Promise<{ id: string }>
  createCheckoutSession(
    input: BillingCheckoutRequest,
    idempotencyKey: string,
  ): Promise<BillingCheckoutSession>
  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<BillingPortalSession>
  verifyWebhook(input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent
  retrieveSubscription(id: string): Promise<BillingSubscription | null>
  listSubscriptions(customerId: string): Promise<BillingSubscription[]>
}

export type BillingOutboxMessage =
  | { kind: 'billing.webhook'; eventId: string }
  | { kind: 'billing.reconcile'; customerId: string }

export type ClaimedBillingJob = {
  attempts: number
  id: string
  leaseToken: string
  message: BillingOutboxMessage
}

export interface BillingJobStore {
  claimBatch(input: {
    leaseForMilliseconds: number
    limit: number
    maxAttempts: number
    now: Date
  }): Promise<ClaimedBillingJob[]>
  complete(input: ClaimedBillingJob): Promise<boolean>
  extendLease(input: {
    id: string
    leaseForMilliseconds: number
    leaseToken: string
    now: Date
  }): Promise<boolean>
  retryOrDead(input: {
    error: string
    id: string
    leaseToken: string
    maxAttempts: number
    nextAvailableAt: Date
  }): Promise<{ dead: boolean }>
}

export type ClaimedBillingOutboxMessage = {
  id: string
  leaseToken: string
  message: BillingOutboxMessage
}

export interface BillingOutboxStore {
  claimBatch(input: {
    limit: number
    leaseForMilliseconds: number
    now: Date
  }): Promise<ClaimedBillingOutboxMessage[]>
  markSent(input: ClaimedBillingOutboxMessage): Promise<boolean>
  releaseClaim(input: {
    claimed: ClaimedBillingOutboxMessage
    error: string
    retryAt: Date
  }): Promise<void>
}

export interface BillingOutboxPublisher {
  publish(message: BillingOutboxMessage): Promise<void>
}

/**
 * At-least-once outbox relay. Provider and webhook workers must deduplicate
 * downstream work using the Stripe event ID already carried by the message.
 */
export class BillingOutboxDispatcher {
  constructor(
    private readonly store: BillingOutboxStore,
    private readonly publisher: BillingOutboxPublisher,
  ) {}

  async dispatchOnce(
    input: {
      now?: Date
      limit?: number
      leaseForMilliseconds?: number
      retryDelayMilliseconds?: number
    } = {},
  ): Promise<{ failed: number; sent: number }> {
    const now = input.now ?? new Date()
    const retryDelayMilliseconds = input.retryDelayMilliseconds ?? 30_000
    const claimed = await this.store.claimBatch({
      leaseForMilliseconds: input.leaseForMilliseconds ?? 60_000,
      limit: input.limit ?? 10,
      now,
    })
    let failed = 0
    let sent = 0
    for (const message of claimed) {
      try {
        await this.publisher.publish(message.message)
        if (await this.store.markSent(message)) sent += 1
      } catch (error) {
        failed += 1
        await this.store.releaseClaim({
          claimed: message,
          error:
            error instanceof Error ? error.message : 'Outbox publish failed',
          retryAt: new Date(now.getTime() + retryDelayMilliseconds),
        })
      }
    }
    return { failed, sent }
  }
}
