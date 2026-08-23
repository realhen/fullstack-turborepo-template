import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresBillingJobStore } from './postgres-job.store.js'

const databaseUrl = process.env.DATABASE_RLS_TEST_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('PostgresBillingJobStore integration', () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const stores = [
    new PostgresBillingJobStore(pool),
    new PostgresBillingJobStore(pool),
  ]
  const createdIds: string[] = []

  beforeAll(async () => {
    await pool.query('DELETE FROM billing_outbox WHERE topic = $1', [
      'billing.integration-test',
    ])
  })

  afterAll(async () => {
    if (createdIds.length) {
      await pool.query(
        'DELETE FROM billing_outbox WHERE id = ANY($1::uuid[])',
        [createdIds],
      )
    }
    await pool.end()
  })

  async function insertJob(
    availableAt = new Date(),
    payload: unknown = undefined,
  ): Promise<string> {
    const id = randomUUID()
    createdIds.push(id)
    await pool.query(
      `INSERT INTO billing_outbox (id, topic, payload, available_at)
       VALUES ($1, 'billing.integration-test', $2::jsonb, $3)`,
      [
        id,
        JSON.stringify(
          payload ?? { eventId: `evt-${id}`, kind: 'billing.webhook' },
        ),
        availableAt,
      ],
    )
    return id
  }

  it('claims disjoint jobs, rejects stale leases, recovers expired work, and dead-letters exhausted jobs', async () => {
    await insertJob()
    await insertJob()
    const now = new Date()
    const [firstClaims = [], secondClaims = []] = await Promise.all(
      stores.map((store) =>
        store.claimBatch({
          leaseForMilliseconds: 10,
          limit: 2,
          maxAttempts: 3,
          now,
        }),
      ),
    )
    expect(
      new Set([...firstClaims, ...secondClaims].map((job) => job.id)).size,
    ).toBe(firstClaims.length + secondClaims.length)
    await Promise.all(
      [...firstClaims, ...secondClaims].map((job) =>
        job.leaseToken ? stores[0]!.complete(job) : Promise.resolve(false),
      ),
    )

    const crashedJob = await insertJob()
    const [staleClaim] = await stores[0]!.claimBatch({
      leaseForMilliseconds: 1,
      limit: 1,
      maxAttempts: 3,
      now: new Date(),
    })
    expect(staleClaim?.id).toBe(crashedJob)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const [reclaimed] = await stores[1]!.claimBatch({
      leaseForMilliseconds: 100,
      limit: 1,
      maxAttempts: 3,
      now: new Date(),
    })
    expect(reclaimed?.id).toBe(crashedJob)
    expect(await stores[0]!.complete(staleClaim!)).toBe(false)

    const deadJob = await insertJob()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [claim] = await stores[0]!.claimBatch({
        leaseForMilliseconds: 100,
        limit: 1,
        maxAttempts: 3,
        now: new Date(),
      })
      expect(claim?.id).toBe(deadJob)
      await stores[0]!.retryOrDead({
        error: 'expected test failure',
        id: claim!.id,
        leaseToken: claim!.leaseToken,
        maxAttempts: 3,
        nextAvailableAt: new Date(Date.now() - 1),
      })
    }
    expect(
      await stores[1]!.claimBatch({
        leaseForMilliseconds: 100,
        limit: 10,
        maxAttempts: 3,
        now: new Date(),
      }),
    ).not.toContainEqual(expect.objectContaining({ id: deadJob }))
  })

  it('terminally dead-letters an expired final attempt instead of stranding it', async () => {
    const id = await insertJob()
    await pool.query(
      `UPDATE billing_outbox
       SET attempts = 3, lease_token = gen_random_uuid(),
           lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [id],
    )
    expect(
      await stores[0]!.claimBatch({
        leaseForMilliseconds: 100,
        limit: 10,
        maxAttempts: 3,
        now: new Date(),
      }),
    ).not.toContainEqual(expect.objectContaining({ id }))
    const result = await pool.query<{
      dead_at: Date | null
      last_error: string
    }>('SELECT dead_at, last_error FROM billing_outbox WHERE id = $1', [id])
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row?.dead_at).toBeInstanceOf(Date)
    expect(row?.last_error).toContain('lease expired')
  })

  it('terminally dead-letters an exhausted unleased job', async () => {
    const id = await insertJob()
    await pool.query(
      `UPDATE billing_outbox
       SET attempts = 3, lease_token = NULL, lease_expires_at = NULL
       WHERE id = $1`,
      [id],
    )

    expect(
      await stores[0]!.claimBatch({
        leaseForMilliseconds: 100,
        limit: 10,
        maxAttempts: 3,
        now: new Date(),
      }),
    ).not.toContainEqual(expect.objectContaining({ id }))

    const result = await pool.query<{
      dead_at: Date | null
      last_error: string
    }>('SELECT dead_at, last_error FROM billing_outbox WHERE id = $1', [id])
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row?.dead_at).toBeInstanceOf(Date)
    expect(row?.last_error).toContain('exhausted')
  })

  it('terminally dead-letters malformed job payloads', async () => {
    const id = await insertJob(new Date(), { kind: 'unsupported' })
    expect(
      await stores[0]!.claimBatch({
        leaseForMilliseconds: 100,
        limit: 10,
        maxAttempts: 3,
        now: new Date(),
      }),
    ).not.toContainEqual(expect.objectContaining({ id }))
    const result = await pool.query<{
      dead_at: Date | null
      last_error: string
    }>('SELECT dead_at, last_error FROM billing_outbox WHERE id = $1', [id])
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(row?.dead_at).toBeInstanceOf(Date)
    expect(row?.last_error).toContain('malformed')
  })
})
