import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { OrganizationPermissionGuard } from './organization-permission.guard'

describe('OrganizationPermissionGuard', () => {
  it('does not treat provider token scopes as organization authority', async () => {
    const guard = new OrganizationPermissionGuard(
      {
        getAllAndOverride: () => ({
          organizationParam: 'organizationId',
          permissions: ['billing:manage'],
        }),
      } as never,
      {
        authenticate: async () => ({
          id: 'user-a',
          provider: 'oidc',
          scopes: ['billing:manage'],
        }),
      } as never,
      { hasAll: async () => false },
    )

    await expect(
      guard.canActivate({
        getClass: () => undefined,
        getHandler: () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer token' },
            params: { organizationId: 'org-a' },
          }),
        }),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
