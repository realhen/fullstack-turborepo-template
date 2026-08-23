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
        authenticate: async () => ({
          id: 'user-1',
          provider: 'local',
          scopes: ['projects:members:manage'],
        }),
      } as never,
      {
        getMembership: async () => ({
          project: { id: 'project-1', name: 'Project' },
          role: 'viewer',
          userId: 'user-1',
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
            params: { projectId: 'project-1' },
          }),
        }),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
