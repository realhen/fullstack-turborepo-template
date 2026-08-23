import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  CurrentPrincipal,
  RequireAuthenticated,
  RequireOrganizationPermissions,
} from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { OrganizationPermissionGuard } from './organization-permission.guard'
import { OrganizationIdPipe } from './organization-id.pipe'
import { AcceptInvitationDto, CreateInvitationDto } from './invitation.dto'
import { InvitationService } from './invitation.service'

@ApiTags('invitations')
@ApiBearerAuth()
@Controller({ path: '', version: '1' })
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('organizations/:organizationId/invitations')
  @UseGuards(OrganizationPermissionGuard)
  @RequireOrganizationPermissions(['members:invite'])
  create(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateInvitationDto,
  ) {
    return this.invitations.create(organizationId, principal.userId ?? principal.id, input)
  }

  @Delete('organizations/:organizationId/invitations/:invitationId')
  @UseGuards(OrganizationPermissionGuard)
  @RequireOrganizationPermissions(['members:manage'])
  revoke(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @Param('invitationId', new ParseUUIDPipe({ version: '4' })) invitationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.invitations.revoke(organizationId, principal.userId ?? principal.id, invitationId)
  }

  @Post('invitations/accept')
  @RequireAuthenticated()
  accept(@Body() input: AcceptInvitationDto, @CurrentPrincipal() principal: Principal) {
    return this.invitations.accept(input.token, {
      email: principal.email,
      userId: principal.userId ?? principal.id,
    })
  }
}
