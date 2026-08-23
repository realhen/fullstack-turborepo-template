import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { DatabaseModule } from '../database/database.module'
import { AuthenticationService } from './application/authentication.service'
import { AuthModule } from './auth.module'

describe('AuthModule', () => {
  it('provides AuthenticationService without project or organization modules', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
      ],
    }).compile()
    expect(module.get(AuthenticationService)).toBeInstanceOf(
      AuthenticationService,
    )
    await module.close()
  })
})
