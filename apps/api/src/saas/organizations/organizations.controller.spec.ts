import { describe, expect, it } from 'vitest'
import { OrganizationsController } from './organizations.controller'
import { InMemoryOrganizationMembershipStore } from './in-memory-organization-membership.store'
import { OrganizationService } from './organization.service'

describe('OrganizationsController', () => {
  it('uses the durable user id when it has been resolved', async () => {
    const controller = new OrganizationsController(
      new OrganizationService(
        new InMemoryOrganizationMembershipStore([
          {
            organization: { id: 'org-a', name: 'A', slug: 'a' },
            role: 'member',
            userId: 'durable-user',
          },
        ]),
      ),
    )

    await expect(
      controller.list(
        {
          id: 'oidc-subject',
          provider: 'https://issuer.example',
          scopes: ['organizations:read'],
          userId: 'durable-user',
        },
        { limit: 50 },
      ),
    ).resolves.toEqual([
      {
        organization: { id: 'org-a', name: 'A', slug: 'a' },
        role: 'member',
      },
    ])
  })
})
