export type AuditActorType = 'service_account' | 'system' | 'user'

export type AuditEventInput = {
  action: string
  actorId: string
  actorType: AuditActorType
  metadata?: Record<string, unknown>
  organizationId: string
  projectId?: string
  requestId?: string
  resourceId?: string
  resourceType: string
}

export interface AuditStore {
  append(event: AuditEventInput): Promise<void>
}

export const AUDIT_STORE = Symbol('AUDIT_STORE')
