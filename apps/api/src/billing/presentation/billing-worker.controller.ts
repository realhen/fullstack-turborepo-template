import { timingSafeEqual } from 'node:crypto'
import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { BillingProjectionProcessor } from '../application/billing-projection.processor'
import type { BillingOutboxMessage } from '../domain/billing.types'

/** Internal worker callback; never expose this shared secret to a browser. */
@Controller({ path: 'internal/billing', version: '1' })
export class BillingWorkerController {
  constructor(
    private readonly processor: BillingProjectionProcessor,
    private readonly config: ConfigService,
  ) {}

  @Post('jobs')
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async process(
    @Headers('x-worker-secret') secret: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    this.assertWorkerSecret(secret)
    const message = parseWorkerMessage(body)
    if (message.kind === 'billing.webhook') {
      await this.processor.process(message.eventId)
      return
    }
    if (message.kind === 'billing.reconcile') {
      await this.processor.reconcile(message.customerId)
      return
    }
  }

  private assertWorkerSecret(secret: string | undefined): void {
    const expected = this.config.getOrThrow<string>('WORKER_SECRET')
    if (!secret)
      throw new ForbiddenException('Worker authentication is required')
    const actualBuffer = Buffer.from(secret)
    const expectedBuffer = Buffer.from(expected)
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Worker authentication is invalid')
    }
  }
}

function parseWorkerMessage(value: unknown): BillingOutboxMessage {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('Billing worker message is invalid')
  }
  const message = value as Record<string, unknown>
  if (
    message.kind === 'billing.webhook' &&
    typeof message.eventId === 'string' &&
    message.eventId.trim()
  ) {
    return { eventId: message.eventId, kind: 'billing.webhook' }
  }
  if (
    message.kind === 'billing.reconcile' &&
    typeof message.customerId === 'string' &&
    message.customerId.trim()
  ) {
    return { customerId: message.customerId, kind: 'billing.reconcile' }
  }
  throw new BadRequestException('Billing worker message is invalid')
}
