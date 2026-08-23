import type { VerifiedBillingEvent } from '@repo/billing'

/**
 * Adapter boundary for an SQS/EventBridge consumer. Infrastructure owns actual
 * delivery; the worker receives an already-durable inbox event and delegates
 * it to API-owned projection logic.
 */
export interface BillingEventProcessor {
  process(eventId: string): Promise<void>
  reconcile(customerId: string): Promise<void>
}

export type BillingQueueMessage =
  | { kind: 'billing.webhook'; eventId: string }
  | { kind: 'billing.reconcile'; customerId: string }

export async function processBillingQueueMessage(
  message: BillingQueueMessage,
  processor: BillingEventProcessor,
): Promise<void> {
  if (message.kind === 'billing.webhook') {
    await processor.process(message.eventId)
    return
  }
  await processor.reconcile(message.customerId)
}

export type BillingWebhookEvent = VerifiedBillingEvent
