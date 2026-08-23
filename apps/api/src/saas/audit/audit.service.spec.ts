import { describe, expect, it } from 'vitest'
import { AuditService } from './audit.service'
import type { AuditEventInput, AuditStore } from './audit.types'

describe('AuditService', () => {
  it('redacts credentials before persistence', async () => {
    const events: AuditEventInput[] = []
    const store: AuditStore = {
      append: async (event) => void events.push(event),
    }
    const service = new AuditService(store)

    await service.append({
      action: 'api_key.created',
      actorId: 'user-1',
      actorType: 'user',
      metadata: { token: 'must-not-persist', visible: 'safe' },
      organizationId: 'org-1',
      resourceType: 'api_key',
    })

    expect(events).toEqual([
      expect.objectContaining({
        metadata: { token: '[redacted]', visible: 'safe' },
      }),
    ])
  })
})
