import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common'
import type { Pool } from 'pg'
import { DATABASE_POOL } from './database.constants'

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end()
  }
}
