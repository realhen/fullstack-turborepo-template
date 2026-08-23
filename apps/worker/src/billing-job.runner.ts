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
            now.getTime() + this.options.retryDelayMilliseconds,
          )
          const outcome = await this.store.retryOrDead({
            error:
              error instanceof Error ? error.message : 'Billing job failed',
            id: job.id,
            leaseToken: job.leaseToken,
            maxAttempts: this.options.maxAttempts,
            nextAvailableAt,
          })
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
    const heartbeat = setInterval(
      () => {
        void this.store.extendLease({
          id: job.id,
          leaseForMilliseconds: this.options.leaseMilliseconds,
          leaseToken: job.leaseToken,
          now: new Date(),
        })
      },
      Math.max(1_000, Math.floor(this.options.leaseMilliseconds / 2)),
    )
    try {
      await this.processor.process(job.message)
      await this.store.complete(job)
    } finally {
      clearInterval(heartbeat)
    }
  }
}
