import { describe, expect, it } from 'vitest'
import { InMemoryAuditReadStore } from '../infrastructure/in-memory-audit-read.store'
import { AuditReadService } from './audit-read.service'

describe('AuditReadService', () => {
  it('does not return cross-tenant audit events and produces a stable cursor', async () => {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z')
    const service = new AuditReadService(
      new InMemoryAuditReadStore([
        {
          action: 'a',
          actorId: 'user-a',
          actorType: 'user',
          id: 'b',
          metadata: {},
          occurredAt,
          organizationId: 'org-a',
          projectId: null,
          resourceId: null,
          resourceType: 'project',
        },
        {
          action: 'other',
          actorId: 'user-b',
          actorType: 'user',
          id: 'c',
          metadata: {},
          occurredAt,
          organizationId: 'org-b',
          projectId: null,
          resourceId: null,
          resourceType: 'project',
        },
      ]),
    )

    await expect(
      service.list('org-a', 'user-a', { limit: 1 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ action: 'a' })],
    })
  })
})
