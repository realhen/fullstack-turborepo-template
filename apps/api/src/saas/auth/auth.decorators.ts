import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common'
import type { ProjectMembership } from '../projects/project.types'
import type { Principal, RequestWithPrincipal } from './principal'

export const AUTHORIZATION_REQUIREMENT = 'saas:authorization-requirement'

export type AuthorizationRequirement = {
  organizationParam?: string
  projectParam?: string
  scopes: readonly string[]
}

export const RequireAuthenticated = () =>
  SetMetadata(AUTHORIZATION_REQUIREMENT, {
    scopes: [],
  } satisfies AuthorizationRequirement)

export const ORGANIZATION_PERMISSION_REQUIREMENT =
  'saas:organization-permission-requirement'

export type OrganizationPermissionRequirement = {
  organizationParam: string
  permissions: readonly string[]
}

export const RequireOrganizationPermissions = (
  permissions: string[],
  organizationParam = 'organizationId',
) =>
  SetMetadata(ORGANIZATION_PERMISSION_REQUIREMENT, {
    organizationParam,
    permissions,
  } satisfies OrganizationPermissionRequirement)

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
