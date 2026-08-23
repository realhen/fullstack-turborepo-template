import { describe, expect, it, vi } from 'vitest'
import { SqsQueueConsumer, type SqsTransport } from './sqs-queue.consumer'

describe('SqsQueueConsumer', () => {
  it('deletes only successfully processed messages', async () => {
    const transport: SqsTransport = {
      delete: vi.fn().mockResolvedValue(undefined),
      receive: vi.fn().mockResolvedValue([
        {
          body: JSON.stringify({
            eventId: 'evt_success',
            kind: 'billing.webhook',
          }),
          receiptHandle: 'receipt_success',
        },
        {
          body: JSON.stringify({
            eventId: 'evt_retry',
            kind: 'billing.webhook',
          }),
          receiptHandle: 'receipt_retry',
        },
      ]),
    }
    const processor = {
      process: vi.fn(async (eventId: string) => {
        if (eventId === 'evt_retry') throw new Error('retry later')
      }),
      reconcile: vi.fn(),
    }
    const consumer = new SqsQueueConsumer(transport, 'queue-url', processor)

    await consumer.runOnce()

    expect(transport.delete).toHaveBeenCalledTimes(1)
    expect(transport.delete).toHaveBeenCalledWith({
      queueUrl: 'queue-url',
      receiptHandle: 'receipt_success',
    })
  })
})
