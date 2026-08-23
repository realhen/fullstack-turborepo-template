import type {
  BillingJobStore,
  BillingOutboxMessage,
  ClaimedBillingJob,
} from '@repo/billing'
import { MINIMUM_BILLING_JOB_LEASE_MILLISECONDS } from './worker-config.js'

export interface BillingJobProcessor {
  process(message: BillingOutboxMessage): Promise<void>
}

export class BillingJobRunner {
  constructor(
    private readonly store: BillingJobStore,
    private readonly processor: BillingJobProcessor,
    private readonly options: {
      batchSize: number
      leaseMilliseconds: number
      maxAttempts: number
      retryDelayMilliseconds: number
    },
  ) {
    for (const [name, value] of Object.entries({
      batchSize: options.batchSize,
      maxAttempts: options.maxAttempts,
      retryDelayMilliseconds: options.retryDelayMilliseconds,
    })) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`)
      }
    }
    if (
      !Number.isSafeInteger(options.leaseMilliseconds) ||
      options.leaseMilliseconds < MINIMUM_BILLING_JOB_LEASE_MILLISECONDS
    ) {
      throw new Error(
        `leaseMilliseconds must be at least ${MINIMUM_BILLING_JOB_LEASE_MILLISECONDS}`,
      )
    }
    if (this.heartbeatIntervalMilliseconds() >= options.leaseMilliseconds) {
      throw new Error('leaseMilliseconds must leave time for a heartbeat')
    }
  }

  async runOnce(
    now = new Date(),
  ): Promise<{ claimed: number; failed: number }> {
    const jobs = await this.store.claimBatch({
      leaseForMilliseconds: this.options.leaseMilliseconds,
      limit: this.options.batchSize,
      maxAttempts: this.options.maxAttempts,
      now,
    })
    let failed = 0
    await Promise.all(
      jobs.map(async (job) => {
        try {
          await this.process(job)
        } catch (error) {
          failed += 1
          const nextAvailableAt = new Date(
            Date.now() + this.options.retryDelayMilliseconds,
          )
          const outcome = await this.store.retryOrDead({
            error:
              error instanceof Error ? error.message : 'Billing job failed',
            id: job.id,
            leaseToken: job.leaseToken,
            maxAttempts: this.options.maxAttempts,
            nextAvailableAt,
          })
          if (!outcome.updated) {
            console.error(
              JSON.stringify({
                attempt: job.attempts,
                event: 'billing_job_lease_lost',
                jobId: job.id,
                operation: 'retry_or_dead',
              }),
            )
            return
          }
          console.error(
            JSON.stringify({
              attempt: job.attempts,
              error:
                error instanceof Error ? error.message : 'Billing job failed',
              event: outcome.dead ? 'billing_job_dead' : 'billing_job_retry',
              jobId: job.id,
              nextRetryAt: outcome.dead
                ? undefined
                : nextAvailableAt.toISOString(),
            }),
          )
        }
      }),
    )
    return { claimed: jobs.length, failed }
  }

  private async process(job: ClaimedBillingJob): Promise<void> {
    let heartbeatInFlight: Promise<void> | undefined
    const extendLease = () => {
      if (heartbeatInFlight) return
      const pending = this.extendLease(job)
      heartbeatInFlight = pending
      void pending.finally(() => {
        if (heartbeatInFlight === pending) heartbeatInFlight = undefined
      })
    }
    const heartbeat = setInterval(
      extendLease,
      this.heartbeatIntervalMilliseconds(),
    )
    try {
      await this.processor.process(job.message)
      clearInterval(heartbeat)
      await heartbeatInFlight
      if (!(await this.store.complete(job))) {
        console.error(
          JSON.stringify({
            attempt: job.attempts,
            event: 'billing_job_lease_lost',
            jobId: job.id,
            operation: 'complete',
          }),
        )
      }
    } finally {
      clearInterval(heartbeat)
      await heartbeatInFlight
    }
  }

  private heartbeatIntervalMilliseconds(): number {
    return Math.floor(this.options.leaseMilliseconds / 2)
  }

  private async extendLease(job: ClaimedBillingJob): Promise<void> {
    try {
      const extended = await this.store.extendLease({
        id: job.id,
        leaseForMilliseconds: this.options.leaseMilliseconds,
        leaseToken: job.leaseToken,
        now: new Date(),
      })
      if (!extended) {
        console.error(
          JSON.stringify({
            attempt: job.attempts,
            event: 'billing_job_lease_lost',
            jobId: job.id,
            operation: 'extend_lease',
          }),
        )
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          attempt: job.attempts,
          error:
            error instanceof Error ? error.message : 'Lease extension failed',
          event: 'billing_job_lease_error',
          jobId: job.id,
        }),
      )
    }
  }
}
