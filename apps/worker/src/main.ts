import { createDatabase, requireDatabaseConfig } from '@repo/database'
import {
  BillingJobRunner,
  type BillingJobProcessor,
} from './billing-job.runner.js'
import { PostgresBillingJobStore } from './postgres-job.store.js'

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

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return Number(value)
}

async function run(): Promise<void> {
  const processorUrl = process.env.BILLING_PROCESSOR_URL
  const workerToken = process.env.WORKER_SECRET
  if (!processorUrl || !workerToken) {
    throw new Error(
      'BILLING_PROCESSOR_URL and WORKER_SECRET are required for the billing worker',
    )
  }
  const pollMilliseconds = positiveInteger('BILLING_JOB_POLL_MS', 1_000)
  const database = createDatabase(requireDatabaseConfig())
  const runner = new BillingJobRunner(
    new PostgresBillingJobStore(database.pool),
    new HttpBillingProcessor(processorUrl, workerToken),
    {
      batchSize: positiveInteger('BILLING_JOB_BATCH_SIZE', 10),
      leaseMilliseconds: positiveInteger('BILLING_JOB_LEASE_MS', 60_000),
      maxAttempts: positiveInteger('BILLING_JOB_MAX_ATTEMPTS', 5),
      retryDelayMilliseconds: positiveInteger('BILLING_JOB_RETRY_MS', 30_000),
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
      await new Promise((resolve) => setTimeout(resolve, pollMilliseconds))
    }
  } finally {
    await database.pool.end()
  }
}

run().catch((error: unknown) => {
  console.error('Billing worker failed', error)
  process.exitCode = 1
})
