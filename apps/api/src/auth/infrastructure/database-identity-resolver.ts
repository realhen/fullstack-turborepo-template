import { PreTenantAuthorizationLookup } from '@repo/database'
import type { Pool } from 'pg'
import type { IdentityResolver } from '../domain/identity-resolver'
import type { Principal } from '../domain/principal'

/**
 * Fail-closed resolver. Provisioning is intentionally a separate workflow so
 * an email claim alone cannot silently attach an external identity to a user.
 */
export class DatabaseIdentityResolver implements IdentityResolver {
  private readonly authorizationLookup: PreTenantAuthorizationLookup

  constructor(pool: Pool) {
    this.authorizationLookup = new PreTenantAuthorizationLookup(pool)
  }

  async resolve(principal: Principal): Promise<Principal> {
    const userId = await this.authorizationLookup.resolveLinkedUserId(
      principal.provider,
      principal.id,
    )
    if (userId) return { ...principal, userId }
    if (!principal.email || !principal.emailVerified) {
      throw new Error(
        'A verified provider email is required for first-time provisioning',
      )
    }
    const provisionedUserId =
      await this.authorizationLookup.provisionLinkedUser({
        email: principal.email,
        issuer: principal.provider,
        provider: principal.provider,
        subject: principal.id,
      })
    return { ...principal, userId: provisionedUserId }
  }
}
