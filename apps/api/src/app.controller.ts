import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AppService } from './app.service'

@ApiTags('app')
@Controller({ path: '', version: '1' })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Confirm that the API is running' })
  @ApiOkResponse({
    schema: { example: { message: 'Your NestJS API is ready.' } },
  })
  getWelcome(): { message: string } {
    return this.appService.getWelcome()
  }
}
