import { describe, expect, it, vi } from 'vitest'
import { processBillingQueueMessage } from './index.js'

describe('processBillingQueueMessage', () => {
  it('dispatches webhook and reconciliation work to the matching processor method', async () => {
    const processor = {
      process: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
    }

    await processBillingQueueMessage(
      { eventId: 'evt_1', kind: 'billing.webhook' },
      processor,
    )
    await processBillingQueueMessage(
      { customerId: 'cus_1', kind: 'billing.reconcile' },
      processor,
    )

    expect(processor.process).toHaveBeenCalledWith('evt_1')
    expect(processor.reconcile).toHaveBeenCalledWith('cus_1')
  })
})
