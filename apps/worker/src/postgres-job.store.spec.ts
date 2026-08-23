import { describe, expect, it, vi } from 'vitest'
import { PostgresBillingJobStore } from './postgres-job.store.js'

describe('PostgresBillingJobStore', () => {
  it('does not log a dead job when the claim transaction rolls back', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              attempts: 3,
              id: 'exhausted-job',
              last_error: 'Billing job exhausted without an active lease',
            },
          ],
        })
        .mockRejectedValueOnce(new Error('candidate query failed'))
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    }
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await expect(
        new PostgresBillingJobStore(pool).claimBatch({
          leaseForMilliseconds: 1_000,
          limit: 1,
          maxAttempts: 3,
          now: new Date(),
        }),
      ).rejects.toThrow('candidate query failed')

      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining('"event":"billing_job_dead"'),
      )
    } finally {
      log.mockRestore()
    }
  })
})
