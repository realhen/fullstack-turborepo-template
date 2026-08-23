import { describe, expect, it, vi } from 'vitest'
import {
  SqsBillingOutboxPublisher,
  type SqsPublisherTransport,
} from './sqs-outbox.publisher'

describe('SqsBillingOutboxPublisher', () => {
  it('serializes a billing message for the configured SQS queue', async () => {
    const transport: SqsPublisherTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    }
    const publisher = new SqsBillingOutboxPublisher(transport, 'queue-url')

    await publisher.publish({ eventId: 'evt_1', kind: 'billing.webhook' })

    expect(transport.send).toHaveBeenCalledWith({
      body: JSON.stringify({ eventId: 'evt_1', kind: 'billing.webhook' }),
      queueUrl: 'queue-url',
    })
  })
})
