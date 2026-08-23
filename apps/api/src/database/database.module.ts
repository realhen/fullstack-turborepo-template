import { Module } from '@nestjs/common'
import {
  createDatabase,
  databaseConfigFromEnvironment,
} from '@repo/database'
import type { Pool } from 'pg'
import { DATABASE_POOL } from './database.constants'
import { DatabaseLifecycleService } from './database.service'

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool | null => {
        const config = databaseConfigFromEnvironment()
        return config ? createDatabase(config).pool : null
      },
    },
    DatabaseLifecycleService,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
