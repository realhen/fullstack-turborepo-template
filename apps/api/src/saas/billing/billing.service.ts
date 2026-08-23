import { randomUUID } from 'node:crypto'
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { Principal } from '../auth/principal'
import { ControlledPlanCatalog } from './billing.catalog'
import {
  BILLING_OUTBOX,
  BILLING_ORGANIZATION_MEMBERSHIP_STORE,
  BILLING_PROVIDER,
  BILLING_REPOSITORY,
  type BillingAccount,
  type BillingOutbox,
  type BillingOrganizationMembershipStore,
  type BillingProvider,
  type BillingRepository,
} from './billing.types'

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    @Inject(BILLING_OUTBOX) private readonly outbox: BillingOutbox,
    @Inject(BILLING_ORGANIZATION_MEMBERSHIP_STORE)
    private readonly organizationMemberships: BillingOrganizationMembershipStore,
    private readonly catalog: ControlledPlanCatalog,
  ) {}

  listPlans() {
    return this.catalog.list().map((plan) => ({
      code: plan.code,
      displayName: plan.displayName,
      interval: plan.interval,
    }))
  }

  async getSummary(organizationId: string, principal: Principal) {
    await this.assertBillingAdministrator(
      organizationId,
      principal.userId ?? principal.id,
    )
    return this.repository.getSummaryForOrganization(organizationId)
  }

  async createCheckout(input: {
    organizationId: string
    principal: Principal
    planCode: string
    successUrl: string
    cancelUrl: string
    quantity?: number
    requestId?: string
  }): Promise<{ id: string; url: string }> {
    await this.assertBillingAdministrator(
      input.organizationId,
      input.principal.userId ?? input.principal.id,
    )
    const plan = this.catalog.get(input.planCode)
    const account = await this.getOrCreateAccount(
      input.organizationId,
      input.principal.email,
    )
    const quantity = input.quantity ?? 1
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new ForbiddenException(
        'Billing quantity must be a positive integer',
      )
    }
    const correlationId = input.requestId ?? randomUUID()
    return this.provider.createCheckoutSession(
      {
        cancelUrl: input.cancelUrl,
        customerId: account.providerCustomerId,
        metadata: {
          correlation_id: correlationId,
          entitlement_keys: plan.entitlementKeys.join(','),
          organization_id: account.organizationId,
        },
        plan,
        quantity,
        successUrl: input.successUrl,
      },
      `checkout:${account.organizationId}:${correlationId}`,
    )
  }

  async createPortal(input: {
    organizationId: string
    principal: Principal
    returnUrl: string
  }): Promise<{ id: string; url: string }> {
    await this.assertBillingAdministrator(
      input.organizationId,
      input.principal.userId ?? input.principal.id,
    )
    const account = await this.getOrCreateAccount(input.organizationId)
    return this.provider.createPortalSession({
      customerId: account.providerCustomerId,
      returnUrl: input.returnUrl,
    })
  }

  /** Redirects are deliberately non-authoritative; only the webhook changes state. */
  async ingestWebhook(
    rawBody: Buffer,
    signature?: string,
  ): Promise<{
    duplicate: boolean
    eventId: string
  }> {
    const event = this.provider.verifyWebhook({ rawBody, signature })
    const inserted = await this.repository.recordWebhookReceipt(event)
    return { duplicate: !inserted, eventId: event.id }
  }

  async enqueueReconciliation(organizationId: string): Promise<void> {
    const account =
      await this.repository.findAccountByOrganization(organizationId)
    if (account) {
      await this.outbox.enqueue({
        customerId: account.providerCustomerId,
        kind: 'billing.reconcile',
      })
    }
  }

  private async getOrCreateAccount(
    organizationId: string,
    email?: string,
  ): Promise<BillingAccount> {
    const current =
      await this.repository.findAccountByOrganization(organizationId)
    if (current) return current
    const customer = await this.provider.createCustomer({
      email,
      organizationId,
    })
    return this.repository.createAccount({
      createdAt: new Date(),
      id: `billing_account_${randomUUID()}`,
      organizationId,
      provider: this.provider.name,
      providerCustomerId: customer.id,
    })
  }

  private async assertBillingAdministrator(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.organizationMemberships.getMembership(
      organizationId,
      userId,
    )
    if (!membership?.canManageBilling) {
      throw new ForbiddenException(
        'Organization billing administrator access is required',
      )
    }
  }
}
