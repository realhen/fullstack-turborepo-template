import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqsQueueConsumer, type SqsTransport } from './sqs-queue.consumer.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SqsQueueConsumer', () => {
  it('deletes only successfully processed messages', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deleteMessage = vi.fn().mockResolvedValue(undefined)
    const transport: SqsTransport = {
      delete: deleteMessage,
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
      process: vi.fn((eventId: string) =>
        eventId === 'evt_retry'
          ? Promise.reject(new Error('retry later'))
          : Promise.resolve(),
      ),
      reconcile: vi.fn(),
    }
    const consumer = new SqsQueueConsumer(transport, 'queue-url', processor)

    await consumer.runOnce()

    expect(deleteMessage).toHaveBeenCalledTimes(1)
    expect(deleteMessage).toHaveBeenCalledWith({
      queueUrl: 'queue-url',
      receiptHandle: 'receipt_success',
    })
    expect(logError).toHaveBeenCalledOnce()
  })
})
