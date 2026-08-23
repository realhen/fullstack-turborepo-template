import {
  BillingOutboxDispatcher,
  type BillingOutboxPublisher,
  type BillingOutboxStore,
  type ClaimedBillingOutboxMessage,
} from '@repo/billing'
import { describe, expect, it, vi } from 'vitest'

class MemoryOutboxStore implements BillingOutboxStore {
  private readonly pending: ClaimedBillingOutboxMessage[]
  readonly released: ClaimedBillingOutboxMessage[] = []
  readonly sent = new Set<string>()

  constructor(messages: ClaimedBillingOutboxMessage[]) {
    this.pending = messages
  }

  async claimBatch(): Promise<ClaimedBillingOutboxMessage[]> {
    return this.pending.filter((message) => !this.sent.has(message.id))
  }

  async markSent(input: ClaimedBillingOutboxMessage): Promise<boolean> {
    if (this.sent.has(input.id)) return false
    this.sent.add(input.id)
    return true
  }

  async releaseClaim(input: { claimed: ClaimedBillingOutboxMessage }): Promise<void> {
    this.released.push(input.claimed)
  }
}

const claimed: ClaimedBillingOutboxMessage = {
  id: 'outbox_1',
  leaseToken: 'lease_1',
  message: { eventId: 'evt_1', kind: 'billing.webhook' },
}

describe('BillingOutboxDispatcher', () => {
  it('marks an outbox row sent only after a successful publish', async () => {
    const store = new MemoryOutboxStore([claimed])
    const publisher: BillingOutboxPublisher = { publish: vi.fn().mockResolvedValue(undefined) }

    await expect(new BillingOutboxDispatcher(store, publisher).dispatchOnce()).resolves.toEqual({
      failed: 0,
      sent: 1,
    })
    expect(publisher.publish).toHaveBeenCalledWith(claimed.message)
    expect(store.sent).toEqual(new Set(['outbox_1']))
  })

  it('releases a claim for retry when publishing fails', async () => {
    const store = new MemoryOutboxStore([claimed])
    const publisher: BillingOutboxPublisher = {
      publish: vi.fn().mockRejectedValue(new Error('SQS unavailable')),
    }

    await expect(new BillingOutboxDispatcher(store, publisher).dispatchOnce()).resolves.toEqual({
      failed: 1,
      sent: 0,
    })
    expect(store.sent.size).toBe(0)
    expect(store.released).toEqual([claimed])
  })

  it('does not publish a row again after it has been marked sent', async () => {
    const store = new MemoryOutboxStore([claimed])
    const publisher: BillingOutboxPublisher = { publish: vi.fn().mockResolvedValue(undefined) }
    const dispatcher = new BillingOutboxDispatcher(store, publisher)

    await dispatcher.dispatchOnce()
    await dispatcher.dispatchOnce()

    expect(publisher.publish).toHaveBeenCalledTimes(1)
  })
})
