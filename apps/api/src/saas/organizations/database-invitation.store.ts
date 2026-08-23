import {
  PreTenantAuthorizationLookup,
  withTenantRepository,
} from '@repo/database'
import type { Pool } from 'pg'
import type { CreateInvitationInput, InvitationStore } from './invitation.types'

export class DatabaseInvitationStore implements InvitationStore {
  private readonly lookup: PreTenantAuthorizationLookup

  constructor(private readonly pool: Pool) {
    this.lookup = new PreTenantAuthorizationLookup(pool)
  }

  create(
    organizationId: string,
    actorId: string,
    input: CreateInvitationInput,
  ) {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.createInvitation({ actorId, organizationId }, input),
    )
  }

  revoke(organizationId: string, actorId: string, invitationId: string) {
    return withTenantRepository(
      this.pool,
      { actorId, organizationId },
      (repository) =>
        repository.revokeInvitation({ actorId, organizationId }, invitationId),
    )
  }

  async accept(
    tokenHash: string,
    user: { email: string; userId: string },
  ): Promise<boolean> {
    const invitation = await this.lookup.resolveInvitation(tokenHash)
    if (
      !invitation ||
      invitation.email.toLowerCase() !== user.email ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      return false
    }
    return withTenantRepository(
      this.pool,
      { actorId: user.userId, organizationId: invitation.organizationId },
      (repository) =>
        repository.acceptInvitation(
          { actorId: user.userId, organizationId: invitation.organizationId },
          {
            id: invitation.id,
            projectId: invitation.projectId,
            roleId: invitation.roleId,
          },
        ),
    )
  }
}
