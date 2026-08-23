export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER')
export const BILLING_REPOSITORY = Symbol('BILLING_REPOSITORY')
export const BILLING_OUTBOX = Symbol('BILLING_OUTBOX')
export const BILLING_STORE = Symbol('BILLING_STORE')

export type BillingProviderName = 'disabled' | 'local' | 'stripe'

export type BillingPlan = {
  code: string
  displayName: string
  providerPriceId: string
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

export type SubscriptionProjection = {
  billingAccountId: string
  providerSubscriptionId: string
  status: string
  priceId: string
  quantity: number
  cancelAtPeriodEnd: boolean
  currentPeriodEnd?: Date
  providerUpdatedAt: Date
}

export type InvoiceProjection = {
  billingAccountId: string
  providerInvoiceId: string
  providerSubscriptionId?: string
  status: string
  amountDue: number
  amountPaid: number
  currency: string
  hostedInvoiceUrl?: string
  invoicePdf?: string
  providerUpdatedAt: Date
}

export type EntitlementProjection = {
  billingAccountId: string
  featureKey: string
  active: boolean
  source: 'subscription' | 'provider_entitlement' | 'manual'
  providerUpdatedAt: Date
}

export type BillingSummary = {
  account: BillingAccount | null
  entitlements: EntitlementProjection[]
  invoices: InvoiceProjection[]
  subscriptions: SubscriptionProjection[]
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
  createCustomer(
    input: {
      organizationId: string
      email?: string
    },
    idempotencyKey: string,
  ): Promise<{ id: string }>
  createCheckoutSession(
    input: {
      customerId: string
      plan: BillingPlan
      quantity: number
      successUrl: string
      cancelUrl: string
      metadata: Record<string, string>
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string }>
  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ id: string; url: string }>
  verifyWebhook(input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent
  retrieveSubscription(id: string): Promise<ProviderSubscription | null>
  listSubscriptions(customerId: string): Promise<ProviderSubscription[]>
}

export type ProviderSubscription = {
  id: string
  customerId: string
  status: string
  priceId: string
  quantity: number
  cancelAtPeriodEnd: boolean
  currentPeriodEnd?: Date
  updatedAt: Date
  metadata: Record<string, string>
}

export interface BillingRepository {
  findAccountByOrganization(
    organizationId: string,
  ): Promise<BillingAccount | null>
  findAccountByCustomer(customerId: string): Promise<BillingAccount | null>
  createAccount(input: BillingAccount): Promise<BillingAccount>
  getSummaryForOrganization(organizationId: string): Promise<BillingSummary>
  upsertSubscription(input: SubscriptionProjection): Promise<void>
  upsertInvoice(input: InvoiceProjection): Promise<void>
  replaceEntitlements(
    billingAccountId: string,
    entitlements: EntitlementProjection[],
    providerUpdatedAt: Date,
  ): Promise<void>
  /** Atomically persists a verified receipt and its dispatch message. */
  recordWebhookReceipt(event: VerifiedBillingEvent): Promise<boolean>
  insertEvent(event: VerifiedBillingEvent): Promise<boolean>
  getEvent(id: string): Promise<VerifiedBillingEvent | null>
  markEventProcessed(id: string): Promise<void>
  markEventFailed(id: string, error: string): Promise<void>
  listAccounts(): Promise<BillingAccount[]>
}

export type BillingOrganizationMembership = {
  organizationId: string
  userId: string
  canManageBilling: boolean
}

export interface BillingOrganizationMembershipStore {
  getMembership(
    organizationId: string,
    userId: string,
  ): Promise<BillingOrganizationMembership | null>
}

export const BILLING_ORGANIZATION_MEMBERSHIP_STORE = Symbol(
  'BILLING_ORGANIZATION_MEMBERSHIP_STORE',
)

export type BillingOutboxMessage =
  | { kind: 'billing.webhook'; eventId: string }
  | { kind: 'billing.reconcile'; customerId: string }

export interface BillingOutbox {
  enqueue(message: BillingOutboxMessage): Promise<void>
  take(): Promise<BillingOutboxMessage | null>
}
