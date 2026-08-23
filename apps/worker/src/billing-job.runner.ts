import type {
  BillingJobStore,
  BillingOutboxMessage,
  ClaimedBillingJob,
} from '@repo/billing'

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
  ) {}

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
    let heartbeatInFlight = false
    const heartbeat = setInterval(
      () => {
        if (heartbeatInFlight) return
        heartbeatInFlight = true
        void this.store
          .extendLease({
            id: job.id,
            leaseForMilliseconds: this.options.leaseMilliseconds,
            leaseToken: job.leaseToken,
            now: new Date(),
          })
          .then((extended) => {
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
          })
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                attempt: job.attempts,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Lease extension failed',
                event: 'billing_job_lease_error',
                jobId: job.id,
              }),
            )
          })
          .finally(() => {
            heartbeatInFlight = false
          })
      },
      Math.max(1_000, Math.floor(this.options.leaseMilliseconds / 2)),
    )
    try {
      await this.processor.process(job.message)
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
    }
  }
}
