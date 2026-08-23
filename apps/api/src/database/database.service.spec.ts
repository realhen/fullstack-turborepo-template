import { describe, expect, it, vi } from 'vitest'
import { DatabaseLifecycleService } from './database.service'

describe('DatabaseLifecycleService', () => {
  it('closes its task-local pool during application shutdown', async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) }
    const service = new DatabaseLifecycleService(pool as never)

    await service.onApplicationShutdown()

    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('allows development mode without a configured pool', async () => {
    await expect(
      new DatabaseLifecycleService(null).onApplicationShutdown(),
    ).resolves.toBeUndefined()
  })
})
