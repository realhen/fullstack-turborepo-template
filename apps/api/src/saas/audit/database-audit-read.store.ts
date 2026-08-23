import { withTenantRepository } from '@repo/database'
import type { Pool } from 'pg'
import type { AuditReadStore } from './audit-read.types'

export class DatabaseAuditReadStore implements AuditReadStore {
  constructor(private readonly pool: Pool) {}

  list(
    organizationId: string,
    actorId: string,
    input: { cursor?: { id: string; occurredAt: Date }; limit: number },
  ) {
    return withTenantRepository(this.pool, { actorId, organizationId }, (repository) =>
      repository.listAuditEvents({ actorId, organizationId }, input),
    )
  }
}
