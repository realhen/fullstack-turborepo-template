import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger'
import {
  CurrentPrincipal,
  RequireOrganizationPermissions,
} from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'
import { OrganizationPermissionGuard } from './organization-permission.guard'
import { OrganizationIdPipe } from './organization-id.pipe'
import { CreateApiKeyDto, CreateServiceAccountDto } from './api-key.dto'
import { ApiKeyService } from './api-key.service'

@ApiTags('api-keys')
@ApiBearerAuth()
@ApiParam({ format: 'uuid', name: 'organizationId', type: String })
@UseGuards(OrganizationPermissionGuard)
@Controller({ path: 'organizations/:organizationId', version: '1' })
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post('service-accounts')
  @RequireOrganizationPermissions(['api_keys:manage'])
  createServiceAccount(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateServiceAccountDto,
  ) {
    return this.apiKeys.createServiceAccount(
      organizationId,
      principal.userId ?? principal.id,
      input,
    )
  }

  @Post('api-keys')
  @RequireOrganizationPermissions(['api_keys:manage'])
  create(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(
      organizationId,
      principal.userId ?? principal.id,
      input,
    )
  }

  @Delete('api-keys/:apiKeyId')
  @ApiParam({ format: 'uuid', name: 'apiKeyId', type: String })
  @RequireOrganizationPermissions(['api_keys:manage'])
  revoke(
    @Param('organizationId', OrganizationIdPipe) organizationId: string,
    @Param('apiKeyId', new ParseUUIDPipe({ version: '4' })) apiKeyId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.apiKeys.revoke(
      organizationId,
      principal.userId ?? principal.id,
      apiKeyId,
    )
  }
}
