import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { ScopeGuard } from './scope.guard'

describe('ScopeGuard project authorization', () => {
  it('does not let a token scope bypass a project role', async () => {
    const guard = new ScopeGuard(
      {
        getAllAndOverride: () => ({
          projectParam: 'projectId',
          scopes: ['projects:members:manage'],
        }),
      } as never,
      {
        authenticate: () =>
          Promise.resolve({
            id: '00000000-0000-4000-8000-000000000001',
            provider: 'local',
            scopes: ['projects:members:manage'],
          }),
      } as never,
      {
        getMembership: () =>
          Promise.resolve({
            project: {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Project',
            },
            role: 'viewer',
            userId: '00000000-0000-4000-8000-000000000001',
          }),
        hasRoleScopes: () => false,
      } as never,
    )

    await expect(
      guard.canActivate({
        getClass: () => undefined,
        getHandler: () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer local' },
            params: { projectId: '00000000-0000-4000-8000-000000000002' },
          }),
        }),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
