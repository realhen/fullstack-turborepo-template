export type AuditReadEvent = {
  action: string
  actorId: string | null
  actorType: string
  id: string
  metadata: Record<string, unknown>
  occurredAt: Date
  projectId: string | null
  resourceId: string | null
  resourceType: string
}

export interface AuditReadStore {
  list(
    organizationId: string,
    actorId: string,
    input: { cursor?: { id: string; occurredAt: Date }; limit: number },
  ): Promise<AuditReadEvent[]>
}

export const AUDIT_READ_STORE = Symbol('AUDIT_READ_STORE')
