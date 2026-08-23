import { randomUUID } from 'node:crypto'
import type { CreateInvitationInput, InvitationStore } from './invitation.types'

type StoredInvitation = CreateInvitationInput & {
  acceptedAt?: Date
  id: string
  organizationId: string
  revokedAt?: Date
}

export class InMemoryInvitationStore implements InvitationStore {
  private readonly invitations = new Map<string, StoredInvitation>()

  async create(
    organizationId: string,
    _actorId: string,
    input: CreateInvitationInput,
  ): Promise<{ id: string }> {
    const duplicate = [...this.invitations.values()].some(
      (invitation) =>
        invitation.organizationId === organizationId &&
        invitation.email === input.email &&
        invitation.projectId === input.projectId &&
        !invitation.acceptedAt &&
        !invitation.revokedAt,
    )
    if (duplicate) {
      const error = Object.assign(new Error('Duplicate invitation'), { code: '23505' })
      throw error
    }
    const id = randomUUID()
    this.invitations.set(id, { ...input, id, organizationId })
    return { id }
  }

  async revoke(
    organizationId: string,
    _actorId: string,
    invitationId: string,
  ): Promise<boolean> {
    const invitation = this.invitations.get(invitationId)
    if (
      !invitation ||
      invitation.organizationId !== organizationId ||
      invitation.acceptedAt ||
      invitation.revokedAt
    ) {
      return false
    }
    invitation.revokedAt = new Date()
    return true
  }

  async accept(tokenHash: string, user: { email: string; userId: string }): Promise<boolean> {
    const invitation = [...this.invitations.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    )
    if (
      !invitation ||
      invitation.email !== user.email ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      return false
    }
    invitation.acceptedAt = new Date()
    return true
  }
}
