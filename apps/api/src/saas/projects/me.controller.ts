import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Principal as PrincipalModel } from '../../openapi.models'
import { CurrentPrincipal, RequireAuthenticated } from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'

@ApiTags('identity')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  @Get()
  @RequireAuthenticated()
  @ApiOkResponse({ type: PrincipalModel })
  getMe(@CurrentPrincipal() principal: Principal) {
    return principal
  }
}
