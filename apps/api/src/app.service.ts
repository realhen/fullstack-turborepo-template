import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getWelcome(): { message: string } {
    return { message: 'Your NestJS API is ready.' }
  }
}
