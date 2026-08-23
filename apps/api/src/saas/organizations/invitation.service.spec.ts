import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { InMemoryInvitationStore } from './in-memory-invitation.store'
import { InvitationService } from './invitation.service'

describe('InvitationService', () => {
  it('prevents duplicate active invitations and returns the token once', async () => {
    const service = new InvitationService(new InMemoryInvitationStore())
    const first = await service.create('org-a', 'user-a', {
      email: 'person@example.com',
    })

    expect(first.token).toMatch(/^inv_/)
    await expect(
      service.create('org-a', 'user-a', { email: 'person@example.com' }),
    ).rejects.toThrow('active invitation')
  })

  it('does not accept an expired invitation', async () => {
    const store = new InMemoryInvitationStore()
    const token = 'expired-token'
    await store.create('org-a', 'user-a', {
      email: 'person@example.com',
      expiresAt: new Date(Date.now() - 1_000),
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    const service = new InvitationService(store)

    await expect(
      service.accept(`inv_${token}`, {
        email: 'person@example.com',
        userId: 'user-b',
      }),
    ).rejects.toThrow('expired')
  })
})
