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
        authenticate: () =>
          Promise.resolve({
            id: '00000000-0000-4000-8000-000000000001',
            provider: 'oidc',
            scopes: ['billing:manage'],
          }),
      } as never,
      { hasAll: () => Promise.resolve(false) },
    )

    await expect(
      guard.canActivate({
        getClass: () => undefined,
        getHandler: () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer token' },
            params: {
              organizationId: '00000000-0000-4000-8000-000000000002',
            },
          }),
        }),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
