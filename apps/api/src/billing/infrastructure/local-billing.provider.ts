import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import type {
  BillingProvider,
  BillingProviderName,
  ProviderSubscription,
  VerifiedBillingEvent,
} from '../domain/billing.types'
import { verifyStripeWebhookSignature } from '../domain/webhook-signature'

/** A deterministic offline provider for local development and service tests. */
export class LocalBillingProvider implements BillingProvider {
  readonly name: BillingProviderName = 'local'
  readonly subscriptions = new Map<string, ProviderSubscription>()

  constructor(private readonly webhookSecret = 'local-webhook-secret') {}

  createCustomer(
    input: { organizationId: string },
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    void idempotencyKey
    return Promise.resolve({ id: `local_cus_${input.organizationId}` })
  }

  createCheckoutSession(
    input: {
      customerId: string
      plan: { providerPriceId: string }
      quantity: number
      metadata: Record<string, string>
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string }> {
    void idempotencyKey
    const id = `local_cs_${randomUUID()}`
    const subscriptionId = `local_sub_${randomUUID()}`
    this.subscriptions.set(subscriptionId, {
      cancelAtPeriodEnd: false,
      customerId: input.customerId,
      id: subscriptionId,
      metadata: input.metadata,
      priceId: input.plan.providerPriceId,
      quantity: input.quantity,
      status: 'active',
      updatedAt: new Date(),
    })
    return Promise.resolve({
      id,
      url: `https://local.billing.test/checkout/${id}`,
    })
  }

  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ id: string; url: string }> {
    const id = `local_bps_${randomUUID()}`
    return Promise.resolve({
      id,
      url:
        `https://local.billing.test/portal/${input.customerId}` +
        `?return=${encodeURIComponent(input.returnUrl)}`,
    })
  }

  verifyWebhook(input: {
    rawBody: Buffer
    signature?: string
  }): VerifiedBillingEvent {
    verifyStripeWebhookSignature({
      rawBody: input.rawBody,
      secret: this.webhookSecret,
      ...(input.signature === undefined ? {} : { signature: input.signature }),
    })
    return parseEvent(input.rawBody, this.name)
  }

  retrieveSubscription(id: string): Promise<ProviderSubscription | null> {
    return Promise.resolve(this.subscriptions.get(id) ?? null)
  }

  listSubscriptions(customerId: string): Promise<ProviderSubscription[]> {
    return Promise.resolve(
      [...this.subscriptions.values()].filter(
        (subscription) => subscription.customerId === customerId,
      ),
    )
  }
}

export function parseEvent(
  rawBody: Buffer,
  provider: BillingProviderName,
): VerifiedBillingEvent {
  let payload: unknown
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    throw new BadRequestException('Billing webhook body is invalid JSON')
  }
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('Billing webhook body is invalid')
  }
  const event = payload as {
    id?: unknown
    type?: unknown
    created?: unknown
    data?: { object?: unknown }
  }
  if (
    typeof event.id !== 'string' ||
    typeof event.type !== 'string' ||
    !event.data?.object ||
    typeof event.data.object !== 'object'
  ) {
    throw new BadRequestException('Billing webhook event is invalid')
  }
  const createdAt =
    typeof event.created === 'number'
      ? new Date(event.created * 1000)
      : new Date()
  return {
    createdAt,
    id: event.id,
    object: event.data.object as Record<string, unknown>,
    provider,
    raw: rawBody.toString('utf8'),
    type: event.type,
  }
}
