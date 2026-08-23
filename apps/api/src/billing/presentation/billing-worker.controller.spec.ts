import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { BillingWorkerController } from './billing-worker.controller'

function setup() {
  const processor = {
    process: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue(undefined),
  }
  const config = { getOrThrow: vi.fn().mockReturnValue('shared-worker-secret') }
  return {
    controller: new BillingWorkerController(
      processor as never,
      config as never,
    ),
    processor,
  }
}

describe('BillingWorkerController', () => {
  it('rejects missing and invalid worker secrets', async () => {
    const { controller } = setup()
    const message = { eventId: 'evt_1', kind: 'billing.webhook' } as const

    await expect(controller.process(undefined, message)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(controller.process('wrong', message)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('dispatches a valid worker job after timing-safe authentication', async () => {
    const { controller, processor } = setup()

    await controller.process('shared-worker-secret', {
      eventId: 'evt_1',
      kind: 'billing.webhook',
    })

    expect(processor.process).toHaveBeenCalledWith('evt_1')
  })
})
