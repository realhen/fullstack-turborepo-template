import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { AUDIT_READ_STORE, type AuditReadStore } from './audit-read.types'

@Injectable()
export class AuditReadService {
  constructor(
    @Inject(AUDIT_READ_STORE) private readonly audit: AuditReadStore,
  ) {}

  async list(
    organizationId: string,
    actorId: string,
    input: { cursor?: string; limit?: number },
  ) {
    const limit = input.limit ?? 50
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined
    const events = await this.audit.list(organizationId, actorId, {
      ...(cursor ? { cursor } : {}),
      limit: limit + 1,
    })
    const items = events.slice(0, limit)
    const last = items.at(-1)
    return {
      items,
      ...(events.length > limit && last
        ? {
            nextCursor: this.encodeCursor({
              id: last.id,
              occurredAt: last.occurredAt,
            }),
          }
        : {}),
    }
  }

  private encodeCursor(cursor: { id: string; occurredAt: Date }): string {
    return Buffer.from(
      JSON.stringify({
        id: cursor.id,
        occurredAt: cursor.occurredAt.toISOString(),
      }),
    ).toString('base64url')
  }

  private decodeCursor(value: string): { id: string; occurredAt: Date } {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as {
        id?: unknown
        occurredAt?: unknown
      }
      const occurredAt =
        typeof parsed.occurredAt === 'string'
          ? new Date(parsed.occurredAt)
          : undefined
      if (
        typeof parsed.id !== 'string' ||
        !occurredAt ||
        Number.isNaN(occurredAt.valueOf())
      ) {
        throw new Error('Invalid audit cursor')
      }
      return { id: parsed.id, occurredAt }
    } catch {
      throw new BadRequestException('Invalid audit cursor')
    }
  }
}
