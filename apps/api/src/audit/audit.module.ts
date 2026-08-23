import { Module } from '@nestjs/common'
import type { Pool } from 'pg'
import { AuthModule } from '../auth/auth.module'
import { DATABASE_POOL } from '../database/database.constants'
import { DatabaseModule } from '../database/database.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { AuditReadService } from './application/audit-read.service'
import { AuditService } from './application/audit.service'
import { AUDIT_READ_STORE } from './domain/audit-read.types'
import { AUDIT_STORE } from './domain/audit.types'
import { DatabaseAuditReadStore } from './infrastructure/database-audit-read.store'
import { DatabaseAuditStore } from './infrastructure/database-audit.store'
import { InMemoryAuditReadStore } from './infrastructure/in-memory-audit-read.store'
import { AuditReadController } from './presentation/audit-read.controller'

@Module({
  imports: [AuthModule, DatabaseModule, OrganizationsModule],
  controllers: [AuditReadController],
  providers: [
    InMemoryAuditReadStore,
    {
      provide: AUDIT_READ_STORE,
      inject: [InMemoryAuditReadStore, DATABASE_POOL],
      useFactory: (memory: InMemoryAuditReadStore, pool: Pool | null) =>
        pool ? new DatabaseAuditReadStore(pool) : memory,
    },
    {
      provide: AUDIT_STORE,
      inject: [InMemoryAuditReadStore, DATABASE_POOL],
      useFactory: (memory: InMemoryAuditReadStore, pool: Pool | null) =>
        pool ? new DatabaseAuditStore(pool) : memory,
    },
    AuditReadService,
    AuditService,
  ],
  exports: [AUDIT_READ_STORE, AUDIT_STORE, AuditService],
})
export class AuditModule {}
