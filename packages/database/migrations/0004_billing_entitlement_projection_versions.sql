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
