import { createDatabase, requireDatabaseConfig } from '@repo/database'
import {
  BillingJobRunner,
  type BillingJobProcessor,
} from './billing-job.runner.js'
import { PostgresBillingJobStore } from './postgres-job.store.js'
import { workerConfigFromEnvironment } from './worker-config.js'

class HttpBillingProcessor implements BillingJobProcessor {
  constructor(
    private readonly processorUrl: string,
    private readonly workerToken: string,
  ) {}

  async process(
    message: Parameters<BillingJobProcessor['process']>[0],
  ): Promise<void> {
    const response = await fetch(this.processorUrl, {
      body: JSON.stringify(message),
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': this.workerToken,
      },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`Billing processor failed: ${response.status}`)
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
  const config = workerConfigFromEnvironment()
  const database = createDatabase(requireDatabaseConfig())
  const runner = new BillingJobRunner(
    new PostgresBillingJobStore(database.pool),
    new HttpBillingProcessor(processorUrl, workerToken),
    {
      batchSize: config.batchSize,
      leaseMilliseconds: config.leaseMilliseconds,
      maxAttempts: config.maxAttempts,
      retryDelayMilliseconds: config.retryDelayMilliseconds,
    },
  )
  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    while (!stopping) {
      try {
        await runner.runOnce()
      } catch (error) {
        console.error(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Billing job claim failed',
            event: 'billing_job_claim_failed',
          }),
        )
      }
      await new Promise((resolve) =>
        setTimeout(resolve, config.pollMilliseconds),
      )
    }
  } finally {
    await database.pool.end()
  }
}

run().catch((error: unknown) => {
  console.error('Billing worker failed', error)
  process.exitCode = 1
})
