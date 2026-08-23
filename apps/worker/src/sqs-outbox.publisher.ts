import type { BillingOutboxMessage, BillingOutboxPublisher } from '@repo/billing'

export interface SqsPublisherTransport {
  send(input: { body: string; queueUrl: string }): Promise<void>
}

/** Publishes durable outbox messages to the same queue consumed by this worker. */
export class SqsBillingOutboxPublisher implements BillingOutboxPublisher {
  constructor(
    private readonly transport: SqsPublisherTransport,
    private readonly queueUrl: string,
  ) {}

  publish(message: BillingOutboxMessage): Promise<void> {
    return this.transport.send({ body: JSON.stringify(message), queueUrl: this.queueUrl })
  }
}

export async function createAwsSqsPublisherTransport(
  region?: string,
): Promise<SqsPublisherTransport> {
  const moduleName = '@aws-sdk/client-sqs'
  const sdk = (await import(moduleName)) as {
    SendMessageCommand: new (input: Record<string, unknown>) => unknown
    SQSClient: new (input: { region?: string }) => {
      send(command: unknown): Promise<unknown>
    }
  }
  const client = new sdk.SQSClient({ ...(region ? { region } : {}) })
  return {
    async send(input) {
      await client.send(
        new sdk.SendMessageCommand({ MessageBody: input.body, QueueUrl: input.queueUrl }),
      )
    },
  }
}
