import type { BillingOutboxMessage, BillingOutboxPublisher } from '@repo/billing'

/** Local adapter for a development queue endpoint accepting a JSON POST. */
export class LocalHttpBillingOutboxPublisher implements BillingOutboxPublisher {
  constructor(private readonly queueUrl: string) {}

  async publish(message: BillingOutboxMessage): Promise<void> {
    const response = await fetch(this.queueUrl, {
      body: JSON.stringify(message),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Local billing queue publish failed: ${response.status}`)
    }
  }
}
