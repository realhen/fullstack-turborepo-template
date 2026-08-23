import type {
  BillingOutboxMessage,
  BillingOutboxStore,
  ClaimedBillingOutboxMessage,
} from '@repo/billing'

type QueryResult<T> = { rows: T[] }
type QueryClient = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>
  release?: () => void
}
type QueryPool = QueryClient & { connect(): Promise<QueryClient> }

type ClaimedRow = {
  id: string
  lease_token: string
  payload: unknown
}

/**
 * Durable outbox relay store. Claims are short-lived leases, so a worker crash
 * cannot strand a message; sent rows are excluded from every subsequent claim.
 */
export class PostgresBillingOutboxStore implements BillingOutboxStore {
  constructor(private readonly pool: QueryPool) {}

  async claimBatch(input: {
    limit: number
    leaseForMilliseconds: number
    now: Date
  }): Promise<ClaimedBillingOutboxMessage[]> {
    const leaseExpiresAt = new Date(
      input.now.getTime() + input.leaseForMilliseconds,
    )
    const result = await this.withTransaction((client) =>
      client.query<ClaimedRow>(
        `WITH candidates AS (
           SELECT id
           FROM billing_outbox
           WHERE sent_at IS NULL
             AND available_at <= $1
             AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE billing_outbox AS outbox
         SET attempts = outbox.attempts + 1,
             lease_token = gen_random_uuid(),
             lease_expires_at = $3
         FROM candidates
         WHERE outbox.id = candidates.id
         RETURNING outbox.id::text, outbox.lease_token::text, outbox.payload`,
        [input.now, input.limit, leaseExpiresAt],
      ),
    )
    return result.rows.flatMap((row) => {
      const message = parseOutboxMessage(row.payload)
      return message
        ? [{ id: row.id, leaseToken: row.lease_token, message }]
        : []
    })
  }

  async markSent(input: ClaimedBillingOutboxMessage): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE billing_outbox
       SET sent_at = now(), lease_token = NULL, lease_expires_at = NULL,
           last_error = NULL
       WHERE id = $1 AND lease_token = $2 AND sent_at IS NULL
       RETURNING id`,
      [input.id, input.leaseToken],
    )
    return result.rows.length === 1
  }

  async releaseClaim(input: {
    claimed: ClaimedBillingOutboxMessage
    error: string
    retryAt: Date
  }): Promise<void> {
    await this.pool.query(
      `UPDATE billing_outbox
       SET available_at = $3, lease_token = NULL, lease_expires_at = NULL,
           last_error = $4
       WHERE id = $1 AND lease_token = $2 AND sent_at IS NULL`,
      [input.claimed.id, input.claimed.leaseToken, input.retryAt, input.error],
    )
  }

  private async withTransaction<T>(
    operation: (client: QueryClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release?.()
    }
  }
}

function parseOutboxMessage(value: unknown): BillingOutboxMessage | null {
  const message =
    typeof value === 'string'
      ? safelyParseJson(value)
      : value && typeof value === 'object'
        ? value
        : null
  if (!message || typeof message !== 'object') return null
  const payload = message as Record<string, unknown>
  if (
    payload.kind === 'billing.webhook' &&
    typeof payload.eventId === 'string'
  ) {
    return { eventId: payload.eventId, kind: payload.kind }
  }
  if (
    payload.kind === 'billing.reconcile' &&
    typeof payload.customerId === 'string'
  ) {
    return { customerId: payload.customerId, kind: payload.kind }
  }
  return null
}

function safelyParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
