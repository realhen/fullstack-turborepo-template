import { Injectable } from '@nestjs/common'
import type { OrganizationMembershipStore } from '../domain/organization.types'

/**
 * Application authorization port. Implement it with the in-memory membership
 * store for local/test mode or with the database role/permission resolver in
 * production. Identity-provider claims are deliberately not this authority.
 */
export interface OrganizationPermissionEvaluator {
  hasAll(
    organizationId: string,
    userId: string,
    permissions: readonly string[],
  ): Promise<boolean>
}

export const ORGANIZATION_PERMISSION_EVALUATOR = Symbol(
  'ORGANIZATION_PERMISSION_EVALUATOR',
)

const rolePermissions: Record<string, readonly string[]> = {
  admin: [
    'members:invite',
    'members:manage',
    'projects:read',
    'projects:write',
    'projects:members:manage',
    'api_keys:manage',
    'audit:read',
  ],
  member: ['projects:read', 'projects:write'],
  owner: [
    'billing:manage',
    'members:invite',
    'members:manage',
    'projects:read',
    'projects:write',
    'projects:members:manage',
    'api_keys:manage',
    'audit:read',
  ],
  viewer: ['projects:read'],
}

@Injectable()
export class OrganizationPermissionService implements OrganizationPermissionEvaluator {
  constructor(private readonly memberships: OrganizationMembershipStore) {}

  async hasAll(
    organizationId: string,
    userId: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    const membership = await this.memberships.getMembership(
      organizationId,
      userId,
    )
    const role = membership?.role
    if (!role) return false
    return permissions.every((permission) =>
      rolePermissions[role]?.includes(permission),
    )
  }
}
