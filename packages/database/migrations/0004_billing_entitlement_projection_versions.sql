-- An entitlement projection may validly be empty. Keep its accepted provider
-- version separately so an older non-empty webhook cannot restore access.
CREATE TABLE billing_entitlement_projection_versions (
  billing_account_id text PRIMARY KEY REFERENCES billing_accounts(id) ON DELETE CASCADE,
  provider_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_entitlement_projection_versions (
  billing_account_id,
  provider_updated_at
)
SELECT billing_account_id, MAX(provider_updated_at)
FROM billing_entitlements
GROUP BY billing_account_id
ON CONFLICT (billing_account_id) DO UPDATE
SET provider_updated_at = GREATEST(
  billing_entitlement_projection_versions.provider_updated_at,
  EXCLUDED.provider_updated_at
);

-- This repository has no deployed database yet, so 0004 is part of the
-- baseline. Accounts without entitlement rows need a conservative watermark
-- as well; otherwise an old webhook could create a projection after launch.
INSERT INTO billing_entitlement_projection_versions (
  billing_account_id,
  provider_updated_at
)
SELECT accounts.id, now()
FROM billing_accounts AS accounts
WHERE NOT EXISTS (
  SELECT 1
  FROM billing_entitlement_projection_versions AS versions
  WHERE versions.billing_account_id = accounts.id
)
ON CONFLICT (billing_account_id) DO NOTHING;

-- Refresh each pre-release account from the billing provider after first
-- deployment. The predicate makes this safe if a baseline database is rebuilt.
INSERT INTO billing_outbox (id, topic, payload, available_at)
SELECT
  gen_random_uuid(),
  'billing.reconcile',
  jsonb_build_object(
    'kind', 'billing.reconcile',
    'customerId', accounts.provider_customer_id
  ),
  now()
FROM billing_accounts AS accounts
WHERE NOT EXISTS (
  SELECT 1
  FROM billing_outbox AS jobs
  WHERE jobs.topic = 'billing.reconcile'
    AND jobs.payload ->> 'kind' = 'billing.reconcile'
    AND jobs.payload ->> 'customerId' = accounts.provider_customer_id
);
