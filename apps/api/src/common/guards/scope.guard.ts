import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ProjectService } from '../../projects/application/project.service'
import { assertProjectId } from '../../projects/presentation/project-id.pipe'
import {
  AUTHORIZATION_REQUIREMENT,
  type AuthorizationRequirement,
} from '../decorators/auth.decorators'
import { AuthenticationService } from '../../auth/application/authentication.service'
import type { RequestWithPrincipal } from '../../auth/domain/principal'

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authentication: AuthenticationService,
    private readonly projects: ProjectService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<AuthorizationRequirement>(
        AUTHORIZATION_REQUIREMENT,
        [context.getHandler(), context.getClass()],
      )
    if (!requirement) return true

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>()
    let principal
    try {
      principal = await this.authentication.authenticate(
        request.headers.authorization,
      )
    } catch {
      throw new UnauthorizedException('Valid bearer authentication is required')
    }
    request.principal = principal

    if (requirement.projectParam) {
      const projectId = request.params[requirement.projectParam]
      if (!projectId)
        throw new ForbiddenException('Project context is required')
      assertProjectId(projectId)
      const membership = await this.projects.getMembership(
        projectId,
        principal.userId ?? principal.id,
      )
      if (!membership)
        throw new ForbiddenException('Project membership is required')
      request.project = membership
      if (this.projects.hasRoleScopes(membership.role, requirement.scopes))
        return true
      throw new ForbiddenException(
        'Required project role permission is missing',
      )
    }

    if (requirement.scopes.every((scope) => principal.scopes.includes(scope))) {
      return true
    }
    throw new ForbiddenException('Required scope is missing')
  }
}
