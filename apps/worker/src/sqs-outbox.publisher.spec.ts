import { describe, expect, it, vi } from 'vitest'
import {
  SqsBillingOutboxPublisher,
  type SqsPublisherTransport,
} from './sqs-outbox.publisher.js'

describe('SqsBillingOutboxPublisher', () => {
  it('serializes a billing message for the configured SQS queue', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const transport: SqsPublisherTransport = {
      send,
    }
    const publisher = new SqsBillingOutboxPublisher(transport, 'queue-url')

    await publisher.publish({ eventId: 'evt_1', kind: 'billing.webhook' })

    expect(send).toHaveBeenCalledWith({
      body: JSON.stringify({ eventId: 'evt_1', kind: 'billing.webhook' }),
      queueUrl: 'queue-url',
    })
  })
})
