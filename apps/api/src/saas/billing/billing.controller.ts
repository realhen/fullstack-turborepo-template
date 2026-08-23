import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  CurrentPrincipal,
  RequireAuthenticated,
} from '../../common/decorators/auth.decorators'
import type { Principal } from '../../auth/domain/principal'
import { OrganizationIdPipe } from '../organizations/organization-id.pipe'
import { CreateCheckoutDto, CreatePortalDto } from './billing.dto'
import { BillingService } from './billing.service'

@ApiTags('billing')
@ApiBearerAuth()
@ApiParam({ format: 'uuid', name: 'organizationId', type: String })
@Controller({ path: 'organizations/:organizationId/billing', version: '1' })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequireAuthenticated()
  getSummary(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.billing.getSummary(organizationId, principal)
  }

  @Get('plans')
  @RequireAuthenticated()
  listPlans(
    @Param('organizationId', OrganizationIdPipe) _organizationId: string,
  ) {
    void _organizationId
    return { plans: this.billing.listPlans() }
  }

  @Post('checkout')
  @RequireAuthenticated()
  createCheckout(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateCheckoutDto,
  ) {
    return this.billing.createCheckout({
      cancelUrl: input.cancelUrl,
      organizationId,
      planCode: input.planCode,
      principal,
      ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
      successUrl: input.successUrl,
    })
  }

  @Post('portal')
  @RequireAuthenticated()
  createPortal(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreatePortalDto,
  ) {
    return this.billing.createPortal({
      organizationId,
      principal,
      returnUrl: input.returnUrl,
    })
  }
}
