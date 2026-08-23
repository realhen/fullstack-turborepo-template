import { ServiceUnavailableException } from '@nestjs/common'
import type {
  BillingProvider,
  BillingProviderName,
  ProviderSubscription,
  VerifiedBillingEvent,
} from '../domain/billing.types'

/** Allows deployments before financial-provider credentials are configured. */
export class DisabledBillingProvider implements BillingProvider {
  readonly name: BillingProviderName = 'disabled'

  private unavailable(): never {
    throw new ServiceUnavailableException('Billing is not enabled')
  }

  createCustomer(
    input: {
      organizationId: string
      email?: string
    },
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    void input
    void idempotencyKey
    return this.unavailable()
  }

  createCheckoutSession(
    input: {
      customerId: string
      plan: { providerPriceId: string }
      quantity: number
      successUrl: string
      cancelUrl: string
      metadata: Record<string, string>
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string }> {
    void input
    void idempotencyKey
    return this.unavailable()
  }

  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ id: string; url: string }> {
    void input
    return this.unavailable()
  }

  verifyWebhook(input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent {
    void input
    return this.unavailable()
  }

  retrieveSubscription(id: string): Promise<ProviderSubscription | null> {
    void id
    return this.unavailable()
  }

  listSubscriptions(customerId: string): Promise<ProviderSubscription[]> {
    void customerId
    return this.unavailable()
  }
}
