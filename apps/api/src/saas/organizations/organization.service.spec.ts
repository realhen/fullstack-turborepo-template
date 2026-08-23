import { describe, expect, it } from 'vitest'
import { InMemoryOrganizationMembershipStore } from './in-memory-organization-membership.store'
import { OrganizationService } from './organization.service'

describe('OrganizationService', () => {
  const service = new OrganizationService(
    new InMemoryOrganizationMembershipStore([
      {
        organization: { id: 'org-a', name: 'A', slug: 'a' },
        role: 'owner',
        userId: 'user-a',
      },
    ]),
  )

  it('does not expose another user’s organization', async () => {
    await expect(service.requireMembership('org-a', 'user-b')).rejects.toThrow(
      'Organization was not found',
    )
    await expect(service.listForUser('user-b')).resolves.toEqual([])
  })
})
