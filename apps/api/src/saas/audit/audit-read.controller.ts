import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  CurrentPrincipal,
  RequireOrganizationPermissions,
} from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { OrganizationPermissionGuard } from '../organizations/organization-permission.guard'
import { OrganizationIdPipe } from '../organizations/organization-id.pipe'
import { ListAuditEventsDto } from './audit-read.dto'
import { AuditReadService } from './audit-read.service'

@ApiTags('audit')
@ApiBearerAuth()
@ApiParam({ format: 'uuid', name: 'organizationId', type: String })
@UseGuards(OrganizationPermissionGuard)
@Controller({
  path: 'organizations/:organizationId/audit-events',
  version: '1',
})
export class AuditReadController {
  constructor(private readonly audit: AuditReadService) {}

  @Get()
  @RequireOrganizationPermissions(['audit:read'])
  list(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListAuditEventsDto,
  ) {
    return this.audit.list(
      organizationId,
      principal.userId ?? principal.id,
      query,
    )
  }
}
