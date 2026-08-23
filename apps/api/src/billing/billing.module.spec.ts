import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { BillingService } from './application/billing.service'
import { BillingModule } from './billing.module'

describe('BillingModule', () => {
  it('provides BillingService from the shared database module', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        OrganizationsModule,
        BillingModule,
      ],
    }).compile()
    expect(module.get(BillingService)).toBeInstanceOf(BillingService)
    await module.close()
  })
})
