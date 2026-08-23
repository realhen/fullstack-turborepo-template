import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { OrganizationService } from './application/organization.service'
import { OrganizationsModule } from './organizations.module'

describe('OrganizationsModule', () => {
  it('provides OrganizationService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        OrganizationsModule,
      ],
    }).compile()
    expect(module.get(OrganizationService)).toBeInstanceOf(OrganizationService)
    await module.close()
  })
})
