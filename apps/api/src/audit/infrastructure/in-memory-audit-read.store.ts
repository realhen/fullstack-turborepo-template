import { randomUUID } from 'node:crypto'
import type { AuditEventInput, AuditStore } from '../domain/audit.types'
import type { AuditReadEvent, AuditReadStore } from '../domain/audit-read.types'

export class InMemoryAuditReadStore implements AuditReadStore, AuditStore {
  constructor(
    private readonly events: (AuditReadEvent & {
      organizationId: string
    })[] = [],
  ) {}

  append(event: AuditEventInput): Promise<void> {
    this.events.push({
      action: event.action,
      actorId: event.actorId,
      actorType: event.actorType,
      id: randomUUID(),
      metadata: event.metadata ?? {},
      occurredAt: new Date(),
      organizationId: event.organizationId,
      projectId: event.projectId ?? null,
      resourceId: event.resourceId ?? null,
      resourceType: event.resourceType,
    })
    return Promise.resolve()
  }

  list(
    organizationId: string,
    actorId: string,
    input: { cursor?: { id: string; occurredAt: Date }; limit: number },
  ): Promise<AuditReadEvent[]> {
    void actorId
    const events = this.events
      .filter((event) => event.organizationId === organizationId)
      .sort((left, right) => {
        const occurredAt =
          right.occurredAt.valueOf() - left.occurredAt.valueOf()
        return occurredAt || right.id.localeCompare(left.id)
      })
      .filter((event) => {
        if (!input.cursor) return true
        return (
          event.occurredAt < input.cursor.occurredAt ||
          (event.occurredAt.valueOf() === input.cursor.occurredAt.valueOf() &&
            event.id < input.cursor.id)
        )
      })
      .slice(0, input.limit)
      .map((event) => ({
        action: event.action,
        actorId: event.actorId,
        actorType: event.actorType,
        id: event.id,
        metadata: event.metadata,
        occurredAt: event.occurredAt,
        projectId: event.projectId,
        resourceId: event.resourceId,
        resourceType: event.resourceType,
      }))
    return Promise.resolve(events)
  }
}
