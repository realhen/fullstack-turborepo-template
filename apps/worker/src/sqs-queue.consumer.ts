import {
  processBillingQueueMessage,
  type BillingEventProcessor,
  type BillingQueueMessage,
} from './index.js'

type SqsMessage = { body?: string; receiptHandle?: string }

export interface SqsTransport {
  receive(input: {
    queueUrl: string
    waitTimeSeconds: number
    maxNumberOfMessages: number
  }): Promise<SqsMessage[]>
  delete(input: { queueUrl: string; receiptHandle: string }): Promise<void>
}

/** AWS SQS long-poll consumer: delete occurs only after successful processing. */
export class SqsQueueConsumer {
  constructor(
    private readonly transport: SqsTransport,
    private readonly queueUrl: string,
    private readonly processor: BillingEventProcessor,
  ) {}

  async runOnce(): Promise<void> {
    const messages = await this.transport.receive({
      maxNumberOfMessages: 10,
      queueUrl: this.queueUrl,
      waitTimeSeconds: 20,
    })
    for (const message of messages) {
      const payload = parseMessage(message.body)
      if (!payload || !message.receiptHandle) {
        console.error('Discarding malformed SQS billing message')
        if (message.receiptHandle) {
          await this.transport.delete({
            queueUrl: this.queueUrl,
            receiptHandle: message.receiptHandle,
          })
        }
        continue
      }
      try {
        await processBillingQueueMessage(payload, this.processor)
        await this.transport.delete({
          queueUrl: this.queueUrl,
          receiptHandle: message.receiptHandle,
        })
      } catch (error) {
        // Do not delete: visibility timeout retries this message and the SQS
        // redrive policy moves repeated failures to its DLQ.
        console.error('Billing SQS message processing failed', error)
      }
    }
  }
}

export async function createAwsSqsTransport(
  region?: string,
): Promise<SqsTransport> {
  const moduleName = '@aws-sdk/client-sqs'
  const sdk = (await import(moduleName)) as {
    DeleteMessageCommand: new (input: Record<string, unknown>) => unknown
    ReceiveMessageCommand: new (input: Record<string, unknown>) => unknown
    SQSClient: new (input: { region?: string }) => {
      send(command: unknown): Promise<{ Messages?: SqsMessage[] }>
    }
  }
  const client = new sdk.SQSClient({ ...(region ? { region } : {}) })
  return {
    async receive(input) {
      const response = await client.send(
        new sdk.ReceiveMessageCommand({
          MaxNumberOfMessages: input.maxNumberOfMessages,
          QueueUrl: input.queueUrl,
          WaitTimeSeconds: input.waitTimeSeconds,
        }),
      )
      return response.Messages ?? []
    },
    async delete(input) {
      await client.send(
        new sdk.DeleteMessageCommand({
          QueueUrl: input.queueUrl,
          ReceiptHandle: input.receiptHandle,
        }),
      )
    },
  }
}

function parseMessage(body: string | undefined): BillingQueueMessage | null {
  if (!body) return null
  try {
    const value = JSON.parse(body) as Record<string, unknown>
    if (value.kind === 'billing.webhook' && typeof value.eventId === 'string') {
      return { eventId: value.eventId, kind: value.kind }
    }
    if (
      value.kind === 'billing.reconcile' &&
      typeof value.customerId === 'string'
    ) {
      return { customerId: value.customerId, kind: value.kind }
    }
  } catch {
    return null
  }
  return null
}
