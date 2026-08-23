import type { BillingJobStore, ClaimedBillingJob } from '@repo/billing'
import { describe, expect, it, vi } from 'vitest'
import { BillingJobRunner } from './billing-job.runner.js'

const job: ClaimedBillingJob = {
  attempts: 1,
  id: 'job-1',
  leaseToken: 'lease-1',
  message: { eventId: 'evt-1', kind: 'billing.webhook' },
}

function storeWith(jobs: ClaimedBillingJob[]): Omit<
  BillingJobStore,
  'complete' | 'extendLease' | 'retryOrDead'
> & {
  complete: ReturnType<typeof vi.fn<BillingJobStore['complete']>>
  extendLease: ReturnType<typeof vi.fn<BillingJobStore['extendLease']>>
  retryOrDead: ReturnType<typeof vi.fn<BillingJobStore['retryOrDead']>>
} {
  return {
    claimBatch: vi.fn().mockResolvedValue(jobs),
    complete: vi.fn<BillingJobStore['complete']>().mockResolvedValue(true),
    extendLease: vi
      .fn<BillingJobStore['extendLease']>()
      .mockResolvedValue(true),
    retryOrDead: vi
      .fn<BillingJobStore['retryOrDead']>()
      .mockResolvedValue({ dead: false, updated: true }),
  }
}

describe('BillingJobRunner', () => {
  it('completes a claimed job after the processor succeeds', async () => {
    const store = storeWith([job])
    await new BillingJobRunner(
      store,
      { process: vi.fn().mockResolvedValue(undefined) },
      {
        batchSize: 1,
        leaseMilliseconds: 20,
        maxAttempts: 3,
        retryDelayMilliseconds: 1,
      },
    ).runOnce()
    expect(store.complete).toHaveBeenCalledWith(job)
  })

  it('releases a failed job for retry', async () => {
    const store = storeWith([job])
    await new BillingJobRunner(
      store,
      { process: vi.fn().mockRejectedValue(new Error('offline')) },
      {
        batchSize: 1,
        leaseMilliseconds: 20,
        maxAttempts: 3,
        retryDelayMilliseconds: 1,
      },
    ).runOnce()
    expect(store.retryOrDead).toHaveBeenCalledOnce()
  })

  it('does not log a retry when its token-guarded state update loses the lease', async () => {
    const store = storeWith([job])
    store.retryOrDead.mockResolvedValue({ dead: false, updated: false })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await new BillingJobRunner(
        store,
        { process: vi.fn().mockRejectedValue(new Error('offline')) },
        {
          batchSize: 1,
          leaseMilliseconds: 20,
          maxAttempts: 3,
          retryDelayMilliseconds: 1,
        },
      ).runOnce()

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"retry_or_dead"'),
      )
      expect(error).not.toHaveBeenCalledWith(
        expect.stringContaining('"event":"billing_job_retry"'),
      )
    } finally {
      error.mockRestore()
    }
  })

  it('waits for an active heartbeat before completing a job', async () => {
    vi.useFakeTimers()
    const store = storeWith([job])
    let finishProcessing: (() => void) | undefined
    let finishHeartbeat: (() => void) | undefined
    const processing = new Promise<void>((resolve) => {
      finishProcessing = resolve
    })
    store.extendLease.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHeartbeat = resolve
      }).then(() => true),
    )

    try {
      const run = new BillingJobRunner(
        store,
        { process: vi.fn().mockReturnValue(processing) },
        {
          batchSize: 1,
          leaseMilliseconds: 2_000,
          maxAttempts: 3,
          retryDelayMilliseconds: 1,
        },
      ).runOnce()
      await vi.advanceTimersByTimeAsync(1_000)
      finishProcessing?.()
      await Promise.resolve()
      expect(store.complete).not.toHaveBeenCalled()
      finishHeartbeat?.()
      await run
      expect(store.complete).toHaveBeenCalledWith(job)
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs a lost lease when completing a successful job no longer updates it', async () => {
    const store = storeWith([job])
    store.complete.mockResolvedValue(false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await new BillingJobRunner(
        store,
        { process: vi.fn().mockResolvedValue(undefined) },
        {
          batchSize: 1,
          leaseMilliseconds: 20,
          maxAttempts: 3,
          retryDelayMilliseconds: 1,
        },
      ).runOnce()

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"complete"'),
      )
    } finally {
      error.mockRestore()
    }
  })

  it('does not overlap a pending heartbeat lease extension', async () => {
    vi.useFakeTimers()
    const store = storeWith([job])
    let finishHeartbeat: (() => void) | undefined
    store.extendLease.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHeartbeat = resolve
      }).then(() => true),
    )
    let finish: (() => void) | undefined
    const processing = new Promise<void>((resolve) => {
      finish = resolve
    })

    try {
      const run = new BillingJobRunner(
        store,
        { process: vi.fn().mockReturnValue(processing) },
        {
          batchSize: 1,
          leaseMilliseconds: 2_000,
          maxAttempts: 3,
          retryDelayMilliseconds: 1,
        },
      ).runOnce()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(store.extendLease).toHaveBeenCalledOnce()
      finish?.()
      finishHeartbeat?.()
      await run
    } finally {
      vi.useRealTimers()
    }
  })

  it('extends the lease while a processor is still running', async () => {
    vi.useFakeTimers()
    const store = storeWith([job])
    let finish: (() => void) | undefined
    const processing = new Promise<void>((resolve) => {
      finish = resolve
    })

    try {
      const run = new BillingJobRunner(
        store,
        { process: vi.fn().mockReturnValue(processing) },
        {
          batchSize: 1,
          leaseMilliseconds: 2_000,
          maxAttempts: 3,
          retryDelayMilliseconds: 1,
        },
      ).runOnce()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(store.extendLease).toHaveBeenCalledWith(
        expect.objectContaining({ id: job.id, leaseToken: job.leaseToken }),
      )
      finish?.()
      await run
    } finally {
      vi.useRealTimers()
    }
  })
})
