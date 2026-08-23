import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common'
import type { ProjectMembership } from '../projects/project.types'
import type { Principal, RequestWithPrincipal } from './principal'

export const AUTHORIZATION_REQUIREMENT = 'saas:authorization-requirement'

export type AuthorizationRequirement = {
  projectParam?: string
  scopes: readonly string[]
}

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(AUTHORIZATION_REQUIREMENT, {
    scopes,
  } satisfies AuthorizationRequirement)

export const RequireProjectScopes = (
  scopes: string[],
  projectParam = 'projectId',
) =>
  SetMetadata(AUTHORIZATION_REQUIREMENT, {
    projectParam,
    scopes,
  } satisfies AuthorizationRequirement)

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): Principal | undefined =>
    context.switchToHttp().getRequest<RequestWithPrincipal>().principal,
)

export const CurrentProject = createParamDecorator(
  (_: unknown, context: ExecutionContext): ProjectMembership | undefined =>
    context.switchToHttp().getRequest<RequestWithPrincipal>().project,
)
