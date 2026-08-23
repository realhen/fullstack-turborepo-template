import { BillingOutboxDispatcher } from '@repo/billing'
import { createDatabase, databaseUrlFromEnvironment } from '@repo/database'
import {
  processBillingQueueMessage,
  type BillingEventProcessor,
  type BillingQueueMessage,
} from './index.js'
import { LocalHttpBillingOutboxPublisher } from './local-http-outbox.publisher.js'
import { PostgresBillingOutboxStore } from './postgres-outbox.store.js'
import {
  createAwsSqsPublisherTransport,
  SqsBillingOutboxPublisher,
} from './sqs-outbox.publisher.js'
import { createAwsSqsTransport, SqsQueueConsumer } from './sqs-queue.consumer.js'

type HttpMessage = BillingQueueMessage & { receipt: string }

/**
 * Runnable local adapter: GET BILLING_LOCAL_QUEUE_URL returns
 * { messages: [{ kind, eventId|customerId, receipt }] }, and POST
 * {queueUrl}/{receipt}/ack acknowledges successful work. The same endpoint
 * also receives POSTed outbox messages from the local publisher adapter.
 */
class LocalHttpQueue {
  constructor(private readonly queueUrl: string) {}

  async receive(): Promise<HttpMessage[]> {
    const response = await fetch(this.queueUrl)
    if (!response.ok) throw new Error(`Queue poll failed: ${response.status}`)
    const body = (await response.json()) as { messages?: unknown }
    return Array.isArray(body.messages)
      ? body.messages.filter(isHttpMessage)
      : []
  }

  async acknowledge(receipt: string): Promise<void> {
    const response = await fetch(`${this.queueUrl}/${receipt}/ack`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`Queue acknowledgement failed: ${response.status}`)
  }
}

class HttpBillingProcessor implements BillingEventProcessor {
  constructor(
    private readonly processorUrl: string,
    private readonly workerToken: string,
  ) {}

  async process(eventId: string): Promise<void> {
    await this.send({ eventId, kind: 'billing.webhook' })
  }

  async reconcile(customerId: string): Promise<void> {
    await this.send({ customerId, kind: 'billing.reconcile' })
  }

  private async send(message: BillingQueueMessage): Promise<void> {
    const response = await fetch(this.processorUrl, {
      body: JSON.stringify(message),
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': this.workerToken,
      },
      method: 'POST',
    })
    if (!response.ok) throw new Error(`Billing processor failed: ${response.status}`)
  }
}

async function run(): Promise<void> {
  const processorUrl = process.env.BILLING_PROCESSOR_URL
  const workerToken = process.env.WORKER_SECRET
  if (!processorUrl || !workerToken) {
    throw new Error(
      'BILLING_PROCESSOR_URL and WORKER_SECRET are required for the billing worker',
    )
  }
  const processor = new HttpBillingProcessor(processorUrl, workerToken)
  const databaseUrl = databaseUrlFromEnvironment()
  if (process.env.BILLING_WORKER_ADAPTER === 'sqs') {
    const queueUrl = process.env.BILLING_SQS_QUEUE_URL
    if (!queueUrl) throw new Error('BILLING_SQS_QUEUE_URL is required for SQS')
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL or DATABASE_SECRET is required for the SQS outbox relay',
      )
    }
    const consumer = new SqsQueueConsumer(
      await createAwsSqsTransport(process.env.AWS_REGION),
      queueUrl,
      processor,
    )
    const dispatcher = new BillingOutboxDispatcher(
      new PostgresBillingOutboxStore(createDatabase(databaseUrl).pool as never),
      new SqsBillingOutboxPublisher(
        await createAwsSqsPublisherTransport(process.env.AWS_REGION),
        queueUrl,
      ),
    )
    while (true) {
      await dispatcher.dispatchOnce()
      await consumer.runOnce()
    }
  }

  const queueUrl = process.env.BILLING_LOCAL_QUEUE_URL
  if (!queueUrl) {
    throw new Error('BILLING_LOCAL_QUEUE_URL is required for the local worker adapter')
  }
  const queue = new LocalHttpQueue(queueUrl)
  const dispatcher = databaseUrl
    ? new BillingOutboxDispatcher(
        new PostgresBillingOutboxStore(createDatabase(databaseUrl).pool as never),
        new LocalHttpBillingOutboxPublisher(queueUrl),
      )
    : null
  const pollMilliseconds = Number(process.env.BILLING_WORKER_POLL_MS ?? 1_000)
  while (true) {
    if (dispatcher) await dispatcher.dispatchOnce()
    const messages = await queue.receive()
    for (const message of messages) {
      await processBillingQueueMessage(message, processor)
      await queue.acknowledge(message.receipt)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds))
  }
}

function isHttpMessage(value: unknown): value is HttpMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (typeof message.receipt !== 'string' || typeof message.kind !== 'string') {
    return false
  }
  return (
    (message.kind === 'billing.webhook' && typeof message.eventId === 'string') ||
    (message.kind === 'billing.reconcile' &&
      typeof message.customerId === 'string')
  )
}

run().catch((error: unknown) => {
  console.error('Billing worker failed', error)
  process.exitCode = 1
})
