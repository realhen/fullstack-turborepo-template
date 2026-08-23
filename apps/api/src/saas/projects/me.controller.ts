import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentPrincipal, RequireScopes } from '../auth/auth.decorators'
import type { Principal } from '../auth/principal'

@ApiTags('identity')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  @Get()
  @RequireScopes('profile:read')
  getMe(@CurrentPrincipal() principal: Principal) {
    return principal
  }
}
