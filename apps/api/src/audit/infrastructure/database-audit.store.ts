import { withTenantRepository } from '@repo/database'
import type { Pool } from 'pg'
import type { AuditStore, AuditEventInput } from '../domain/audit.types'

export class DatabaseAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  append(event: AuditEventInput): Promise<void> {
    return withTenantRepository(
      this.pool,
      { actorId: event.actorId, organizationId: event.organizationId },
      (repository) =>
        repository.appendAuditEvent(
          { actorId: event.actorId, organizationId: event.organizationId },
          {
            action: event.action,
            actorType: event.actorType,
            ...(event.metadata ? { metadata: event.metadata } : {}),
            ...(event.projectId ? { projectId: event.projectId } : {}),
            ...(event.requestId ? { requestId: event.requestId } : {}),
            ...(event.resourceId ? { resourceId: event.resourceId } : {}),
            resourceType: event.resourceType,
          },
        ),
    )
  }
}
