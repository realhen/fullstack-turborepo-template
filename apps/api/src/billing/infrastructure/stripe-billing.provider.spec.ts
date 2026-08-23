import { BadRequestException } from '@nestjs/common'
import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { StripeBillingProvider } from './stripe-billing.provider'

describe('StripeBillingProvider webhook verification', () => {
  it('accepts an exact raw body signed with the endpoint secret', () => {
    const provider = new StripeBillingProvider('sk_test_unused', 'whsec_test')
    const now = Math.floor(Date.now() / 1000)
    const rawBody = Buffer.from(
      JSON.stringify({
        created: now,
        data: { object: { customer: 'cus_1', id: 'sub_1' } },
        id: 'evt_1',
        type: 'customer.subscription.updated',
      }),
    )
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody.toString('utf8'),
      secret: 'whsec_test',
      timestamp: now,
    })

    expect(provider.verifyWebhook({ rawBody, signature })).toMatchObject({
      createdAt: new Date(now * 1_000),
      id: 'evt_1',
      provider: 'stripe',
    })
  })

  it('rejects a changed payload even when its original signature is supplied', () => {
    const provider = new StripeBillingProvider('sk_test_unused', 'whsec_test')
    const now = Math.floor(Date.now() / 1000)
    const signedBody = Buffer.from('{"id":"evt_1"}')
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: signedBody.toString('utf8'),
      secret: 'whsec_test',
      timestamp: now,
    })

    expect(() =>
      provider.verifyWebhook({
        rawBody: Buffer.from('{"id":"evt_2"}'),
        signature,
      }),
    ).toThrow(BadRequestException)
  })

  it('uses Stripe auto-pagination when listing all customer subscriptions', async () => {
    const autoPagingToArray = vi.fn().mockResolvedValue([
      {
        cancel_at_period_end: false,
        customer: 'cus_1',
        id: 'sub_1',
        items: { data: [{ price: { id: 'price_1' }, quantity: 1 }] },
        metadata: {},
        status: 'active',
      },
    ])
    const list = vi.fn().mockReturnValue({ autoPagingToArray })
    const provider = new StripeBillingProvider('sk_test_unused', 'whsec_test', {
      subscriptions: { list },
    } as unknown as Stripe)

    await expect(provider.listSubscriptions('cus_1')).resolves.toEqual([
      expect.objectContaining({ id: 'sub_1' }),
    ])
    expect(autoPagingToArray).toHaveBeenCalledWith({ limit: 10_000 })
  })
})
