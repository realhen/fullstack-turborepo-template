-- Billing projections only. Stripe remains the financial system of record.
-- Webhook receipt and outbox insertion are committed in one transaction by
-- PostgresBillingStore before the API returns a 2xx response to Stripe.

CREATE TABLE billing_accounts (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('local', 'stripe', 'disabled')),
  provider_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id),
  UNIQUE (provider, provider_customer_id)
);

CREATE TABLE billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id text NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  provider_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL,
  price_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end timestamptz,
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_subscriptions_account_idx ON billing_subscriptions (billing_account_id);

CREATE TABLE billing_subscription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_subscription_id uuid NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
  provider_subscription_item_id text NOT NULL UNIQUE,
  price_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id text NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  provider_invoice_id text NOT NULL UNIQUE,
  provider_subscription_id text,
  status text NOT NULL,
  amount_due bigint NOT NULL DEFAULT 0,
  amount_paid bigint NOT NULL DEFAULT 0,
  currency text NOT NULL,
  hosted_invoice_url text,
  invoice_pdf text,
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_invoices_account_idx ON billing_invoices (billing_account_id);

CREATE TABLE billing_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id text NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  active boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('subscription', 'provider_entitlement', 'manual')),
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_account_id, feature_key)
);

CREATE TABLE billing_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('local', 'stripe', 'disabled')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_created_at timestamptz NOT NULL,
  object_id text,
  payload jsonb NOT NULL,
  raw_payload text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX billing_webhook_inbox_status_idx
  ON billing_webhook_inbox (status, provider_created_at);

CREATE TABLE billing_outbox (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error text,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_outbox_available_idx
  ON billing_outbox (available_at, lease_expires_at)
  WHERE sent_at IS NULL;

CREATE TABLE billing_idempotent_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  provider_object_id text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, operation, idempotency_key)
);
