import { Inject, Injectable } from '@nestjs/common'
import { AUDIT_STORE, type AuditEventInput, type AuditStore } from './audit.types'

const forbiddenMetadataKeys = new Set([
  'access_token',
  'authorization',
  'cookie',
  'password',
  'refresh_token',
  'secret',
  'token',
])

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_STORE) private readonly auditStore: AuditStore) {}

  append(event: AuditEventInput): Promise<void> {
    return this.auditStore.append({
      ...event,
      ...(event.metadata ? { metadata: this.redact(event.metadata) } : {}),
    })
  }

  private redact(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        forbiddenMetadataKeys.has(key.toLowerCase()) ? '[redacted]' : value,
      ]),
    )
  }
}
