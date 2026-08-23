export type CreateInvitationInput = {
  email: string
  expiresAt: Date
  projectId?: string
  roleId?: string
  tokenHash: string
}

export type InvitationAcceptance = {
  email: string
  expiresAt: Date
  id: string
  organizationId: string
  projectId?: string
  revokedAt?: Date
  acceptedAt?: Date
  roleId?: string
}

export interface InvitationStore {
  accept(tokenHash: string, user: { email: string; userId: string }): Promise<boolean>
  create(
    organizationId: string,
    actorId: string,
    input: CreateInvitationInput,
  ): Promise<{ id: string }>
  revoke(organizationId: string, actorId: string, invitationId: string): Promise<boolean>
}

export const INVITATION_STORE = Symbol('INVITATION_STORE')
