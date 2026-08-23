import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import {
  INVITATION_STORE,
  type InvitationStore,
} from './invitation.types'

const DEFAULT_INVITATION_LIFETIME_DAYS = 7

@Injectable()
export class InvitationService {
  constructor(@Inject(INVITATION_STORE) private readonly invitations: InvitationStore) {}

  async create(
    organizationId: string,
    actorId: string,
    input: { email: string; expiresInDays?: number; projectId?: string; roleId?: string },
  ) {
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = this.hash(rawToken)
    const expiresAt = new Date()
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + (input.expiresInDays ?? DEFAULT_INVITATION_LIFETIME_DAYS),
    )
    try {
      const invitation = await this.invitations.create(organizationId, actorId, {
        email: input.email.trim().toLowerCase(),
        expiresAt,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.roleId ? { roleId: input.roleId } : {}),
        tokenHash,
      })
      // The raw credential is intentionally returned exactly once and never persisted.
      return { ...invitation, expiresAt, token: `inv_${rawToken}` }
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException('An active invitation already exists for this recipient')
      }
      throw error
    }
  }

  async accept(token: string, principal: { email?: string; userId: string }) {
    if (!principal.email) {
      throw new UnauthorizedException('A verified email is required to accept an invitation')
    }
    if (!token.startsWith('inv_')) throw new NotFoundException('Invitation was not found')
    const accepted = await this.invitations.accept(this.hash(token.slice(4)), {
      email: principal.email.trim().toLowerCase(),
      userId: principal.userId,
    })
    if (!accepted) throw new GoneException('Invitation is expired, revoked, or already accepted')
    return { accepted: true }
  }

  async revoke(organizationId: string, actorId: string, invitationId: string) {
    const revoked = await this.invitations.revoke(organizationId, actorId, invitationId)
    if (!revoked) throw new NotFoundException('Active invitation was not found')
    return { revoked: true }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  private isDuplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
  }
}
