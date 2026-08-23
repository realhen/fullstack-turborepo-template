import type {
  BillingJobStore,
  BillingOutboxMessage,
  ClaimedBillingJob,
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
  attempts: number
  id: string
  lease_token: string
  payload: unknown
}

export class PostgresBillingJobStore implements BillingJobStore {
  constructor(private readonly pool: QueryPool) {}

  async claimBatch(input: {
    leaseForMilliseconds: number
    limit: number
    maxAttempts: number
    now: Date
  }): Promise<ClaimedBillingJob[]> {
    const leaseExpiresAt = new Date(
      input.now.getTime() + input.leaseForMilliseconds,
    )
    const rows = await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE billing_outbox
         SET dead_at = now(),
             last_error = COALESCE(
               last_error,
               'Billing job lease expired after its final attempt'
             ),
             lease_token = NULL,
             lease_expires_at = NULL
         WHERE completed_at IS NULL
           AND dead_at IS NULL
           AND attempts >= $2
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at <= $1`,
        [input.now, input.maxAttempts],
      )
      const result = await client.query<ClaimedRow>(
        `WITH candidates AS (
           SELECT id
           FROM billing_outbox
           WHERE completed_at IS NULL
             AND dead_at IS NULL
             AND attempts < $2
             AND available_at <= $1
             AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         UPDATE billing_outbox AS job
         SET attempts = job.attempts + 1,
             lease_token = gen_random_uuid(),
             lease_expires_at = $4
         FROM candidates
         WHERE job.id = candidates.id
         RETURNING job.id::text, job.attempts, job.lease_token::text, job.payload`,
        [input.now, input.maxAttempts, input.limit, leaseExpiresAt],
      )
      const claimed: ClaimedBillingJob[] = []
      for (const row of result.rows) {
        const message = parseMessage(row.payload)
        if (!message) {
          await client.query(
            `UPDATE billing_outbox
             SET dead_at = now(),
                 last_error = 'Billing job has malformed payload',
                 lease_token = NULL,
                 lease_expires_at = NULL
             WHERE id = $1 AND lease_token = $2
               AND completed_at IS NULL AND dead_at IS NULL`,
            [row.id, row.lease_token],
          )
          console.error(
            JSON.stringify({
              attempt: row.attempts,
              error: 'Billing job has malformed payload',
              event: 'billing_job_dead',
              jobId: row.id,
            }),
          )
          continue
        }
        claimed.push({
          attempts: row.attempts,
          id: row.id,
          leaseToken: row.lease_token,
          message,
        })
      }
      return claimed
    })
    return rows
  }

  async complete(input: ClaimedBillingJob): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE billing_outbox
       SET completed_at = now(), lease_token = NULL, lease_expires_at = NULL,
           last_error = NULL
       WHERE id = $1 AND lease_token = $2
         AND completed_at IS NULL AND dead_at IS NULL
       RETURNING id`,
      [input.id, input.leaseToken],
    )
    return result.rows.length === 1
  }

  async extendLease(input: {
    id: string
    leaseForMilliseconds: number
    leaseToken: string
    now: Date
  }): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE billing_outbox
       SET lease_expires_at = $3
       WHERE id = $1 AND lease_token = $2
         AND completed_at IS NULL AND dead_at IS NULL
       RETURNING id`,
      [
        input.id,
        input.leaseToken,
        new Date(input.now.getTime() + input.leaseForMilliseconds),
      ],
    )
    return result.rows.length === 1
  }

  async retryOrDead(input: {
    error: string
    id: string
    leaseToken: string
    maxAttempts: number
    nextAvailableAt: Date
  }): Promise<{ dead: boolean; updated: boolean }> {
    const result = await this.pool.query<{ dead: boolean }>(
      `UPDATE billing_outbox
       SET dead_at = CASE WHEN attempts >= $3 THEN now() ELSE NULL END,
           available_at = CASE WHEN attempts >= $3 THEN available_at ELSE $4 END,
           last_error = $5,
           lease_token = NULL,
           lease_expires_at = NULL
       WHERE id = $1 AND lease_token = $2
         AND completed_at IS NULL AND dead_at IS NULL
       RETURNING dead_at IS NOT NULL AS dead`,
      [
        input.id,
        input.leaseToken,
        input.maxAttempts,
        input.nextAvailableAt,
        input.error,
      ],
    )
    return {
      dead: result.rows[0]?.dead ?? false,
      updated: result.rows.length === 1,
    }
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

function parseMessage(value: unknown): BillingOutboxMessage | null {
  const parsed = typeof value === 'string' ? parseJson(value) : value
  if (!parsed || typeof parsed !== 'object') return null
  const message = parsed as Record<string, unknown>
  if (
    message.kind === 'billing.webhook' &&
    typeof message.eventId === 'string'
  ) {
    return { eventId: message.eventId, kind: 'billing.webhook' }
  }
  if (
    message.kind === 'billing.reconcile' &&
    typeof message.customerId === 'string'
  ) {
    return { customerId: message.customerId, kind: 'billing.reconcile' }
  }
  return null
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
