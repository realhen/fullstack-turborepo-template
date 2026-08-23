import { BadGatewayException, BadRequestException } from '@nestjs/common'
import Stripe from 'stripe'
import type {
  BillingProvider,
  BillingProviderName,
  ProviderSubscription,
  VerifiedBillingEvent,
} from '../domain/billing.types'

// Upgrade deliberately and review Stripe's changelog rather than silently
// inheriting the account default API version.
const STRIPE_API_VERSION = '2026-07-29.dahlia'

/**
 * Stripe SDK adapter. Redirects create hosted sessions only; verified webhook
 * events remain the source for all local subscription and entitlement state.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name: BillingProviderName = 'stripe'
  private readonly stripe: Stripe

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    client?: Stripe,
  ) {
    this.stripe =
      client ??
      new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2,
        typescript: true,
      })
  }

  async createCustomer(
    input: {
      organizationId: string
      email?: string
    },
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    const customer = await this.callStripe(() =>
      this.stripe.customers.create(
        {
          ...(input.email ? { email: input.email } : {}),
          metadata: { organization_id: input.organizationId },
        },
        { idempotencyKey },
      ),
    )
    return { id: customer.id }
  }

  async createCheckoutSession(
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
    const session = await this.callStripe(() =>
      this.stripe.checkout.sessions.create(
        {
          cancel_url: input.cancelUrl,
          customer: input.customerId,
          line_items: [
            { price: input.plan.providerPriceId, quantity: input.quantity },
          ],
          metadata: input.metadata,
          mode: 'subscription',
          subscription_data: { metadata: input.metadata },
          success_url: input.successUrl,
        },
        { idempotencyKey },
      ),
    )
    if (!session.url)
      throw new BadGatewayException('Stripe Checkout did not return a URL')
    return { id: session.id, url: session.url }
  }

  async createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ id: string; url: string }> {
    const session = await this.callStripe(() =>
      this.stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      }),
    )
    return { id: session.id, url: session.url }
  }

  verifyWebhook(input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(
        input.rawBody,
        input.signature ?? '',
        this.webhookSecret,
      )
      return {
        createdAt: new Date(event.created * 1_000),
        id: event.id,
        object: event.data.object as unknown as Record<string, unknown>,
        provider: this.name,
        raw: input.rawBody.toString('utf8'),
        type: event.type,
      }
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature')
    }
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription | null> {
    const subscription = await this.callStripe(() =>
      this.stripe.subscriptions.retrieve(id),
    )
    return toSubscription(subscription)
  }

  async listSubscriptions(customerId: string): Promise<ProviderSubscription[]> {
    const subscriptions = await this.callStripe(() =>
      this.stripe.subscriptions
        .list({ customer: customerId, status: 'all' })
        .autoPagingToArray({ limit: 10_000 }),
    )
    return subscriptions.map(toSubscription)
  }

  private async callStripe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        throw new BadGatewayException({
          message: 'Stripe billing request failed',
          stripeCode: error.code,
          stripeType: error.type,
        })
      }
      throw error
    }
  }
}

function toSubscription(
  subscription: Stripe.Subscription,
): ProviderSubscription {
  const item = subscription.items.data[0]
  const customer =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  return {
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    customerId: customer,
    id: subscription.id,
    metadata: subscription.metadata,
    priceId: item?.price.id ?? '',
    quantity: item?.quantity ?? 1,
    status: subscription.status,
    updatedAt: new Date(),
    ...(item?.current_period_end
      ? { currentPeriodEnd: new Date(item.current_period_end * 1_000) }
      : {}),
  }
}
