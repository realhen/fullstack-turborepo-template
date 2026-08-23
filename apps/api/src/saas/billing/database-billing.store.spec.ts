import { describe, expect, it, vi } from 'vitest'
import { PostgresBillingStore } from './database-billing.store'

describe('PostgresBillingStore', () => {
  it('commits inbox and outbox records in one webhook receipt transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'inbox_1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const release = vi.fn()
    const store = new PostgresBillingStore({
      connect: vi.fn().mockResolvedValue({ query, release }),
      query,
    })

    await expect(
      store.recordWebhookReceipt({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'evt_1',
        object: { id: 'sub_1' },
        provider: 'stripe',
        raw: '{"id":"evt_1"}',
        type: 'customer.subscription.updated',
      }),
    ).resolves.toBe(true)

    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO billing_webhook_inbox'),
        expect.stringContaining('INSERT INTO billing_outbox'),
        'COMMIT',
      ]),
    )
    expect(release).toHaveBeenCalledOnce()
  })
})
