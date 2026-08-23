import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { BillingService } from './billing.service'

@ApiTags('billing')
@Controller({ path: 'billing/stripe', version: '1' })
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException(
        'Raw body is required for webhook verification',
      )
    }
    // This returns only durable receipt state. Redirects and webhook delivery
    // are never interpreted as payment success by the HTTP request itself.
    return this.billing.ingestWebhook(request.rawBody, signature)
  }
}
