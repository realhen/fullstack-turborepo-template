import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check for containers and load balancers' })
  @ApiOkResponse({ schema: { example: { service: 'api', status: 'ok' } } })
  getHealth(): { service: 'api'; status: 'ok' } {
    return { service: 'api', status: 'ok' }
  }
}
