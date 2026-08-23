import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  ORGANIZATION_PERMISSION_REQUIREMENT,
  type OrganizationPermissionRequirement,
} from '../../common/decorators/auth.decorators'
import { AuthenticationService } from '../../auth/application/authentication.service'
import type { RequestWithPrincipal } from '../../auth/domain/principal'
import {
  ORGANIZATION_PERMISSION_EVALUATOR,
  type OrganizationPermissionEvaluator,
} from './organization-permission.service'
import { assertOrganizationId } from './organization-id.pipe'

@Injectable()
export class OrganizationPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
    @Inject(ORGANIZATION_PERMISSION_EVALUATOR)
    private readonly permissions: OrganizationPermissionEvaluator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<OrganizationPermissionRequirement>(
        ORGANIZATION_PERMISSION_REQUIREMENT,
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
    const organizationId = request.params[requirement.organizationParam]
    if (!organizationId)
      throw new ForbiddenException('Organization context is required')
    assertOrganizationId(organizationId)
    const allowed = await this.permissions.hasAll(
      organizationId,
      principal.userId ?? principal.id,
      requirement.permissions,
    )
    if (!allowed)
      throw new ForbiddenException(
        'Required organization permission is missing',
      )
    request.principal = principal
    return true
  }
}
