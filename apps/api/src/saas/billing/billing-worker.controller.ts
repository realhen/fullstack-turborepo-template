import { timingSafeEqual } from 'node:crypto'
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { BillingProjectionProcessor } from './billing-projection.processor'
import type { BillingOutboxMessage } from './billing.types'

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
    @Body() message: BillingOutboxMessage,
  ): Promise<void> {
    this.assertWorkerSecret(secret)
    if (message.kind === 'billing.webhook') {
      await this.processor.process(message.eventId)
      return
    }
    if (message.kind === 'billing.reconcile') {
      await this.processor.reconcile(message.customerId)
      return
    }
    throw new ForbiddenException('Unsupported billing worker message')
  }

  private assertWorkerSecret(secret: string | undefined): void {
    const expected = this.config.getOrThrow<string>('WORKER_SECRET')
    if (!secret) throw new ForbiddenException('Worker authentication is required')
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
