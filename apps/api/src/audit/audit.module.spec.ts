import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { AuditReadService } from './application/audit-read.service'
import { AuditModule } from './audit.module'

describe('AuditModule', () => {
  it('provides AuditReadService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        OrganizationsModule,
        AuditModule,
      ],
    }).compile()
    expect(module.get(AuditReadService)).toBeInstanceOf(AuditReadService)
    await module.close()
  })
})
