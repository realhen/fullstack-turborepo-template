import { randomUUID } from 'node:crypto'
import type {
  BillingAccount,
  BillingOrganizationMembershipStore,
  BillingOutbox,
  BillingOutboxMessage,
  BillingRepository,
  EntitlementProjection,
  InvoiceProjection,
  SubscriptionProjection,
  VerifiedBillingEvent,
} from '../domain/billing.types'

type QueryResult<T> = { rows: T[] }
type QueryClient = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>
  release?: () => void
}
type QueryPool = QueryClient & { connect(): Promise<QueryClient> }

/**
 * PostgreSQL implementation. `recordWebhookReceipt` commits the inbox and
 * outbox together so a 2xx can only follow durable dispatch intent.
 */
export class PostgresBillingStore implements BillingRepository, BillingOutbox {
  constructor(readonly pool: QueryPool) {}

  async findAccountByOrganization(
    organizationId: string,
  ): Promise<BillingAccount | null> {
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM billing_accounts WHERE organization_id = $1',
      [organizationId],
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }

  async findAccountByCustomer(
    customerId: string,
  ): Promise<BillingAccount | null> {
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM billing_accounts WHERE provider_customer_id = $1',
      [customerId],
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }

  async createAccount(input: BillingAccount): Promise<BillingAccount> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO billing_accounts
        (id, organization_id, provider, provider_customer_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id) DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING *`,
      [
        input.id,
        input.organizationId,
        input.provider,
        input.providerCustomerId,
        input.createdAt,
      ],
    )
    const account = result.rows[0]
    if (!account)
      throw new Error('Billing account insert did not return an account')
    return toAccount(account)
  }

  async getSummaryForOrganization(organizationId: string) {
    const account = await this.findAccountByOrganization(organizationId)
    if (!account) {
      return { account, entitlements: [], invoices: [], subscriptions: [] }
    }
    const [subscriptions, invoices, entitlements] = await Promise.all([
      this.pool.query<SubscriptionRow>(
        'SELECT * FROM billing_subscriptions WHERE billing_account_id = $1 ORDER BY created_at DESC',
        [account.id],
      ),
      this.pool.query<InvoiceRow>(
        'SELECT * FROM billing_invoices WHERE billing_account_id = $1 ORDER BY created_at DESC LIMIT 100',
        [account.id],
      ),
      this.pool.query<EntitlementRow>(
        'SELECT * FROM billing_entitlements WHERE billing_account_id = $1 ORDER BY feature_key',
        [account.id],
      ),
    ])
    return {
      account,
      entitlements: entitlements.rows.map(toEntitlement),
      invoices: invoices.rows.map(toInvoice),
      subscriptions: subscriptions.rows.map(toSubscription),
    }
  }

  async upsertSubscription(input: SubscriptionProjection): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_subscriptions
        (billing_account_id, provider_subscription_id, status, price_id, quantity,
         cancel_at_period_end, current_period_end, provider_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider_subscription_id) DO UPDATE SET
         status = EXCLUDED.status, price_id = EXCLUDED.price_id,
         quantity = EXCLUDED.quantity,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         current_period_end = EXCLUDED.current_period_end,
         provider_updated_at = EXCLUDED.provider_updated_at,
         updated_at = now()
       WHERE billing_subscriptions.provider_updated_at <= EXCLUDED.provider_updated_at`,
      [
        input.billingAccountId,
        input.providerSubscriptionId,
        input.status,
        input.priceId,
        input.quantity,
        input.cancelAtPeriodEnd,
        input.currentPeriodEnd ?? null,
        input.providerUpdatedAt,
      ],
    )
  }

  async upsertInvoice(input: InvoiceProjection): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_invoices
        (billing_account_id, provider_invoice_id, provider_subscription_id, status,
         amount_due, amount_paid, currency, hosted_invoice_url, invoice_pdf,
         provider_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (provider_invoice_id) DO UPDATE SET
         status = EXCLUDED.status, amount_due = EXCLUDED.amount_due,
         amount_paid = EXCLUDED.amount_paid, currency = EXCLUDED.currency,
         hosted_invoice_url = EXCLUDED.hosted_invoice_url,
         invoice_pdf = EXCLUDED.invoice_pdf,
         provider_updated_at = EXCLUDED.provider_updated_at, updated_at = now()
       WHERE billing_invoices.provider_updated_at <= EXCLUDED.provider_updated_at`,
      [
        input.billingAccountId,
        input.providerInvoiceId,
        input.providerSubscriptionId ?? null,
        input.status,
        input.amountDue,
        input.amountPaid,
        input.currency,
        input.hostedInvoiceUrl ?? null,
        input.invoicePdf ?? null,
        input.providerUpdatedAt,
      ],
    )
  }

  async replaceEntitlements(
    billingAccountId: string,
    entitlements: EntitlementProjection[],
    providerUpdatedAt: Date,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query(
        'SELECT id FROM billing_accounts WHERE id = $1 FOR UPDATE',
        [billingAccountId],
      )
      const version = await client.query<{ provider_updated_at: Date }>(
        `SELECT provider_updated_at
         FROM billing_entitlement_projection_versions
         WHERE billing_account_id = $1`,
        [billingAccountId],
      )
      const currentVersion = version.rows[0]?.provider_updated_at
      // Equal timestamps are rejected: provider timestamps are not a strict
      // total order, so accepting an equal replacement could restore access.
      if (currentVersion && new Date(currentVersion) >= providerUpdatedAt)
        return
      await client.query(
        'DELETE FROM billing_entitlements WHERE billing_account_id = $1',
        [billingAccountId],
      )
      for (const entitlement of entitlements) {
        await client.query(
          `INSERT INTO billing_entitlements
            (billing_account_id, feature_key, active, source, provider_updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            billingAccountId,
            entitlement.featureKey,
            entitlement.active,
            entitlement.source,
            entitlement.providerUpdatedAt,
          ],
        )
      }
      await client.query(
        `INSERT INTO billing_entitlement_projection_versions
          (billing_account_id, provider_updated_at, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (billing_account_id) DO UPDATE
         SET provider_updated_at = EXCLUDED.provider_updated_at,
             updated_at = now()`,
        [billingAccountId, providerUpdatedAt],
      )
    })
  }

  async recordWebhookReceipt(event: VerifiedBillingEvent): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO billing_webhook_inbox
          (provider, provider_event_id, event_type, provider_created_at, object_id,
           payload, raw_payload, received_at, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now(), 'received')
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING id`,
        [
          event.provider,
          event.id,
          event.type,
          event.createdAt,
          typeof event.object.id === 'string' ? event.object.id : null,
          event.raw,
          event.raw,
        ],
      )
      if (!inserted.rows[0]) return false
      await client.query(
        `INSERT INTO billing_outbox (id, topic, payload, available_at)
         VALUES ($1, 'billing.webhook', $2::jsonb, now())`,
        [
          randomUUID(),
          JSON.stringify({ eventId: event.id, kind: 'billing.webhook' }),
        ],
      )
      return true
    })
  }

  async insertEvent(event: VerifiedBillingEvent): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO billing_webhook_inbox
        (provider, provider_event_id, event_type, provider_created_at, object_id,
         payload, raw_payload, received_at, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now(), 'received')
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [
        event.provider,
        event.id,
        event.type,
        event.createdAt,
        typeof event.object.id === 'string' ? event.object.id : null,
        event.raw,
        event.raw,
      ],
    )
    return Boolean(result.rows[0])
  }

  async getEvent(id: string): Promise<VerifiedBillingEvent | null> {
    const result = await this.pool.query<InboxRow>(
      `SELECT provider, provider_event_id, event_type, provider_created_at, payload,
              raw_payload
       FROM billing_webhook_inbox
       WHERE provider_event_id = $1`,
      [id],
    )
    const row = result.rows[0]
    return row ? toEvent(row) : null
  }

  async markEventProcessed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE billing_webhook_inbox
       SET status = 'processed', processed_at = now(), processing_error = NULL
       WHERE provider_event_id = $1`,
      [id],
    )
  }

  async markEventFailed(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE billing_webhook_inbox
       SET status = 'failed', attempts = attempts + 1, processing_error = $2
       WHERE provider_event_id = $1`,
      [id, error],
    )
  }

  async listAccounts(): Promise<BillingAccount[]> {
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM billing_accounts',
    )
    return result.rows.map(toAccount)
  }

  async enqueue(message: BillingOutboxMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_outbox (id, topic, payload, available_at)
       VALUES ($1, $2, $3::jsonb, now())`,
      [randomUUID(), message.kind, JSON.stringify(message)],
    )
  }

  async take(): Promise<BillingOutboxMessage | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<{
        id: string
        payload: BillingOutboxMessage
      }>(
        `SELECT id, payload FROM billing_outbox
         WHERE dispatched_at IS NULL AND available_at <= now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      )
      const row = result.rows[0]
      if (!row) return null
      await client.query(
        'UPDATE billing_outbox SET dispatched_at = now(), attempts = attempts + 1 WHERE id = $1',
        [row.id],
      )
      return row.payload
    })
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

export class DatabaseBillingOrganizationMembershipStore implements BillingOrganizationMembershipStore {
  constructor(private readonly pool: QueryPool) {}

  async getMembership(organizationId: string, userId: string) {
    const result = await this.pool.query<{ can_manage_billing: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM organization_memberships memberships
         JOIN roles ON roles.id = memberships.role_id
         JOIN role_permissions ON role_permissions.role_id = roles.id
         JOIN permissions ON permissions.id = role_permissions.permission_id
         WHERE memberships.organization_id = $1 AND memberships.user_id = $2
           AND memberships.status = 'active' AND permissions.key = 'billing:manage'
       ) AS can_manage_billing`,
      [organizationId, userId],
    )
    const canManageBilling = result.rows[0]?.can_manage_billing ?? false
    return canManageBilling
      ? { canManageBilling, organizationId, userId }
      : null
  }
}

type AccountRow = {
  id: string
  organization_id: string
  provider: 'disabled' | 'local' | 'stripe'
  provider_customer_id: string
  created_at: Date
}
type InboxRow = {
  provider: 'disabled' | 'local' | 'stripe'
  provider_event_id: string
  event_type: string
  provider_created_at: Date
  payload: Record<string, unknown>
  raw_payload: string
}
type SubscriptionRow = {
  billing_account_id: string
  cancel_at_period_end: boolean
  current_period_end: Date | null
  price_id: string
  provider_subscription_id: string
  provider_updated_at: Date
  quantity: number
  status: string
}
type InvoiceRow = {
  amount_due: number | string
  amount_paid: number | string
  billing_account_id: string
  currency: string
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  provider_invoice_id: string
  provider_subscription_id: string | null
  provider_updated_at: Date
  status: string
}
type EntitlementRow = {
  active: boolean
  billing_account_id: string
  feature_key: string
  provider_updated_at: Date
  source: EntitlementProjection['source']
}

function toAccount(row: AccountRow): BillingAccount {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
  }
}

function toEvent(row: InboxRow): VerifiedBillingEvent {
  return {
    createdAt: new Date(row.provider_created_at),
    id: row.provider_event_id,
    object:
      (row.payload.data as { object?: Record<string, unknown> } | undefined)
        ?.object ?? {},
    provider: row.provider,
    raw: row.raw_payload,
    type: row.event_type,
  }
}

function toSubscription(row: SubscriptionRow): SubscriptionProjection {
  return {
    billingAccountId: row.billing_account_id,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    ...(row.current_period_end
      ? { currentPeriodEnd: new Date(row.current_period_end) }
      : {}),
    priceId: row.price_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerUpdatedAt: new Date(row.provider_updated_at),
    quantity: row.quantity,
    status: row.status,
  }
}

function toInvoice(row: InvoiceRow): InvoiceProjection {
  return {
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    billingAccountId: row.billing_account_id,
    currency: row.currency,
    ...(row.hosted_invoice_url
      ? { hostedInvoiceUrl: row.hosted_invoice_url }
      : {}),
    ...(row.invoice_pdf ? { invoicePdf: row.invoice_pdf } : {}),
    providerInvoiceId: row.provider_invoice_id,
    ...(row.provider_subscription_id
      ? { providerSubscriptionId: row.provider_subscription_id }
      : {}),
    providerUpdatedAt: new Date(row.provider_updated_at),
    status: row.status,
  }
}

function toEntitlement(row: EntitlementRow): EntitlementProjection {
  return {
    active: row.active,
    billingAccountId: row.billing_account_id,
    featureKey: row.feature_key,
    providerUpdatedAt: new Date(row.provider_updated_at),
    source: row.source,
  }
}
