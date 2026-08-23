import { ServiceUnavailableException } from '@nestjs/common'
import type {
  BillingProvider,
  BillingProviderName,
  ProviderSubscription,
  VerifiedBillingEvent,
} from './billing.types'

/** Allows deployments before financial-provider credentials are configured. */
export class DisabledBillingProvider implements BillingProvider {
  readonly name: BillingProviderName = 'disabled'

  private unavailable(): never {
    throw new ServiceUnavailableException('Billing is not enabled')
  }

  createCustomer(_input: {
    organizationId: string
    email?: string
  }): Promise<{ id: string }> {
    return this.unavailable()
  }

  createCheckoutSession(
    _input: {
      customerId: string
      plan: { providerPriceId: string }
      quantity: number
      successUrl: string
      cancelUrl: string
      metadata: Record<string, string>
    },
    _idempotencyKey: string,
  ): Promise<{ id: string; url: string }> {
    return this.unavailable()
  }

  createPortalSession(_input: {
    customerId: string
    returnUrl: string
  }): Promise<{ id: string; url: string }> {
    return this.unavailable()
  }

  verifyWebhook(_input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent {
    return this.unavailable()
  }

  retrieveSubscription(_id: string): Promise<ProviderSubscription | null> {
    return this.unavailable()
  }

  listSubscriptions(_customerId: string): Promise<ProviderSubscription[]> {
    return this.unavailable()
  }
}
