import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { Health } from '../openapi.models'

@ApiTags('health')
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check for containers and load balancers' })
  @ApiOkResponse({ type: Health })
  getHealth(): { service: 'api'; status: 'ok' } {
    return { service: 'api', status: 'ok' }
  }
}
