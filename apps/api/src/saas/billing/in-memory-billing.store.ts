import { Injectable } from '@nestjs/common'
import type {
  BillingAccount,
  BillingOutbox,
  BillingOutboxMessage,
  BillingOrganizationMembership,
  BillingOrganizationMembershipStore,
  BillingRepository,
  EntitlementProjection,
  InvoiceProjection,
  SubscriptionProjection,
  VerifiedBillingEvent,
} from './billing.types'

/** Development/test adapter. Replace with transactional database + outbox. */
@Injectable()
export class InMemoryBillingStore implements BillingRepository, BillingOutbox {
  readonly accountsByOrganization = new Map<string, BillingAccount>()
  readonly accountsByCustomer = new Map<string, BillingAccount>()
  readonly subscriptions = new Map<string, SubscriptionProjection>()
  readonly invoices = new Map<string, InvoiceProjection>()
  readonly entitlements = new Map<string, EntitlementProjection[]>()
  readonly events = new Map<string, VerifiedBillingEvent>()
  readonly processedEvents = new Set<string>()
  readonly failedEvents = new Map<string, string>()
  readonly messages: BillingOutboxMessage[] = []

  findAccountByOrganization(
    organizationId: string,
  ): Promise<BillingAccount | null> {
    return Promise.resolve(
      this.accountsByOrganization.get(organizationId) ?? null,
    )
  }

  findAccountByCustomer(customerId: string): Promise<BillingAccount | null> {
    return Promise.resolve(this.accountsByCustomer.get(customerId) ?? null)
  }

  createAccount(input: BillingAccount): Promise<BillingAccount> {
    const existing = this.accountsByOrganization.get(input.organizationId)
    if (existing) return Promise.resolve(existing)
    this.accountsByOrganization.set(input.organizationId, input)
    this.accountsByCustomer.set(input.providerCustomerId, input)
    return Promise.resolve(input)
  }

  getSummaryForOrganization(organizationId: string) {
    const account = this.accountsByOrganization.get(organizationId) ?? null
    if (!account) {
      return Promise.resolve({
        account,
        entitlements: [],
        invoices: [],
        subscriptions: [],
      })
    }
    return Promise.resolve({
      account,
      entitlements: this.entitlements.get(account.id) ?? [],
      invoices: [...this.invoices.values()].filter(
        (invoice) => invoice.billingAccountId === account.id,
      ),
      subscriptions: [...this.subscriptions.values()].filter(
        (subscription) => subscription.billingAccountId === account.id,
      ),
    })
  }

  upsertSubscription(input: SubscriptionProjection): Promise<void> {
    const current = this.subscriptions.get(input.providerSubscriptionId)
    if (!current || current.providerUpdatedAt <= input.providerUpdatedAt) {
      this.subscriptions.set(input.providerSubscriptionId, input)
    }
    return Promise.resolve()
  }

  upsertInvoice(input: InvoiceProjection): Promise<void> {
    const current = this.invoices.get(input.providerInvoiceId)
    if (!current || current.providerUpdatedAt <= input.providerUpdatedAt) {
      this.invoices.set(input.providerInvoiceId, input)
    }
    return Promise.resolve()
  }

  replaceEntitlements(
    billingAccountId: string,
    entitlements: EntitlementProjection[],
  ): Promise<void> {
    this.entitlements.set(billingAccountId, entitlements)
    return Promise.resolve()
  }

  insertEvent(event: VerifiedBillingEvent): Promise<boolean> {
    if (this.events.has(event.id)) return Promise.resolve(false)
    this.events.set(event.id, event)
    return Promise.resolve(true)
  }

  recordWebhookReceipt(event: VerifiedBillingEvent): Promise<boolean> {
    if (this.events.has(event.id)) return Promise.resolve(false)
    this.events.set(event.id, event)
    this.messages.push({ kind: 'billing.webhook', eventId: event.id })
    return Promise.resolve(true)
  }

  getEvent(id: string): Promise<VerifiedBillingEvent | null> {
    return Promise.resolve(this.events.get(id) ?? null)
  }

  markEventProcessed(id: string): Promise<void> {
    this.processedEvents.add(id)
    this.failedEvents.delete(id)
    return Promise.resolve()
  }

  markEventFailed(id: string, error: string): Promise<void> {
    this.failedEvents.set(id, error)
    return Promise.resolve()
  }

  listAccounts(): Promise<BillingAccount[]> {
    return Promise.resolve([...this.accountsByOrganization.values()])
  }

  enqueue(message: BillingOutboxMessage): Promise<void> {
    this.messages.push(message)
    return Promise.resolve()
  }

  take(): Promise<BillingOutboxMessage | null> {
    return Promise.resolve(this.messages.shift() ?? null)
  }
}

export class InMemoryBillingOrganizationMembershipStore implements BillingOrganizationMembershipStore {
  private readonly memberships = new Map<
    string,
    BillingOrganizationMembership
  >()

  constructor(memberships: readonly BillingOrganizationMembership[] = []) {
    for (const membership of memberships) {
      this.memberships.set(
        this.key(membership.organizationId, membership.userId),
        membership,
      )
    }
  }

  getMembership(
    organizationId: string,
    userId: string,
  ): Promise<BillingOrganizationMembership | null> {
    return Promise.resolve(
      this.memberships.get(this.key(organizationId, userId)) ?? null,
    )
  }

  private key(organizationId: string, userId: string): string {
    return `${organizationId}:${userId}`
  }
}
