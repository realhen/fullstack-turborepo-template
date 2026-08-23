-- The API runtime connects as (or can SET ROLE to) saas_runtime, never as the
-- table owner. PostgreSQL superusers and BYPASSRLS roles are intentionally not
-- valid API credentials.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_runtime') THEN
    CREATE ROLE saas_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

-- Lets the migration principal run the guarded local seed. Production API
-- credentials should instead be a dedicated LOGIN role granted saas_runtime.
GRANT saas_runtime TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app_current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('app.organization_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('app.actor_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER external_identities_set_updated_at BEFORE UPDATE ON external_identities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organization_domains_set_updated_at BEFORE UPDATE ON organization_domains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER permissions_set_updated_at BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER role_permissions_set_updated_at BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organization_memberships_set_updated_at BEFORE UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER project_memberships_set_updated_at BEFORE UPDATE ON project_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invitations_set_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER service_accounts_set_updated_at BEFORE UPDATE ON service_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER api_keys_set_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER outbox_set_updated_at BEFORE UPDATE ON outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- These are the only pre-tenant lookup paths. They are SECURITY DEFINER so an
-- authenticated principal can discover its own tenant/membership before the
-- API has a TenantContext. All subsequent resource work must use RLS-scoped
-- transactions (withTenantTransaction).
CREATE OR REPLACE FUNCTION resolve_authorized_project_membership(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  project_id uuid,
  project_name text,
  role_key text,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.organization_id, p.id, p.name, r.key, pm.user_id
  FROM project_memberships pm
  JOIN projects p ON p.id = pm.project_id AND p.organization_id = pm.organization_id
  JOIN organization_memberships om
    ON om.organization_id = pm.organization_id AND om.user_id = pm.user_id
  LEFT JOIN roles r ON r.id = pm.role_id
  WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id
    AND pm.status = 'active'
    AND om.status = 'active'
    AND p.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION list_authorized_organizations(p_user_id uuid)
RETURNS TABLE (id uuid, name text, slug text, role_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.name, o.slug, r.key
  FROM organization_memberships om
  JOIN organizations o ON o.id = om.organization_id
  LEFT JOIN roles r ON r.id = om.role_id
  WHERE om.user_id = p_user_id
    AND om.status = 'active'
    AND o.status = 'active'
  ORDER BY o.created_at
$$;

CREATE OR REPLACE FUNCTION resolve_linked_user_id(
  p_issuer text,
  p_subject text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ei.user_id
  FROM external_identities ei
  JOIN users u ON u.id = ei.user_id
  WHERE ei.issuer = p_issuer
    AND ei.subject = p_subject
    AND u.status = 'active'
  LIMIT 1
$$;

-- JIT provisioning is limited to a verified email asserted by the single
-- configured OIDC issuer. The API never uses an unverified email for linking.
CREATE OR REPLACE FUNCTION provision_external_identity(
  p_issuer text,
  p_subject text,
  p_provider text,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF nullif(trim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'A verified email is required';
  END IF;

  SELECT user_id INTO v_user_id
  FROM external_identities
  WHERE issuer = p_issuer AND subject = p_subject;
  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  INSERT INTO users (email)
  VALUES (lower(trim(p_email)))
  ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_user_id;

  INSERT INTO external_identities (
    user_id, issuer, subject, provider, email_snapshot, email_verified,
    last_authenticated_at
  ) VALUES (
    v_user_id, p_issuer, p_subject, p_provider, lower(trim(p_email)), true, now()
  )
  ON CONFLICT (issuer, subject) DO UPDATE SET
    last_authenticated_at = now(),
    updated_at = now()
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_invitation_token(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  organization_id uuid,
  project_id uuid,
  role_id uuid,
  email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, organization_id, project_id, role_id, email, expires_at, accepted_at, revoked_at
  FROM invitations
  WHERE token_hash = p_token_hash
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION resolve_api_key_prefix(p_prefix text)
RETURNS TABLE (
  api_key_id uuid,
  secret_hash text,
  scopes jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  service_account_id uuid,
  organization_id uuid,
  project_id uuid,
  service_account_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ak.id, ak.secret_hash, ak.scopes, ak.expires_at, ak.revoked_at,
         sa.id, sa.organization_id, sa.project_id, sa.status
  FROM api_keys ak
  JOIN service_accounts sa ON sa.id = ak.service_account_id
  WHERE ak.prefix = p_prefix
  LIMIT 1
$$;

GRANT USAGE ON SCHEMA public TO saas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations,
  organization_domains,
  projects,
  roles,
  role_permissions,
  organization_memberships,
  project_memberships,
  invitations,
  service_accounts,
  api_keys,
  audit_events
TO saas_runtime;
GRANT SELECT ON permissions TO saas_runtime;
REVOKE ALL ON FUNCTION resolve_authorized_project_membership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_authorized_organizations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_linked_user_id(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION provision_external_identity(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_invitation_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_api_key_prefix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_authorized_project_membership(uuid, uuid) TO saas_runtime;
GRANT EXECUTE ON FUNCTION list_authorized_organizations(uuid) TO saas_runtime;
GRANT EXECUTE ON FUNCTION resolve_linked_user_id(text, text) TO saas_runtime;
GRANT EXECUTE ON FUNCTION provision_external_identity(text, text, text, text) TO saas_runtime;
GRANT EXECUTE ON FUNCTION resolve_invitation_token(text) TO saas_runtime;
GRANT EXECUTE ON FUNCTION resolve_api_key_prefix(text) TO saas_runtime;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Do not FORCE RLS here: the narrowly scoped SECURITY DEFINER lookup
-- functions above must read memberships before a TenantContext exists. The
-- production API must use the non-owner saas_runtime role; table owners,
-- superusers, and BYPASSRLS roles are migration-only credentials.

CREATE POLICY organizations_tenant ON organizations FOR ALL TO saas_runtime
  USING (id = app_current_organization_id())
  WITH CHECK (id = app_current_organization_id());
CREATE POLICY organization_domains_tenant ON organization_domains FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY projects_tenant ON projects FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY roles_tenant ON roles FOR ALL TO saas_runtime
  USING (organization_id IS NULL OR organization_id = app_current_organization_id())
  WITH CHECK (organization_id IS NULL OR organization_id = app_current_organization_id());
CREATE POLICY role_permissions_tenant ON role_permissions FOR ALL TO saas_runtime
  USING (EXISTS (
    SELECT 1 FROM roles
    WHERE roles.id = role_permissions.role_id
      AND (roles.organization_id IS NULL OR roles.organization_id = app_current_organization_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM roles
    WHERE roles.id = role_permissions.role_id
      AND (roles.organization_id IS NULL OR roles.organization_id = app_current_organization_id())
  ));
CREATE POLICY organization_memberships_tenant ON organization_memberships FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY project_memberships_tenant ON project_memberships FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY invitations_tenant ON invitations FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY service_accounts_tenant ON service_accounts FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
CREATE POLICY api_keys_tenant ON api_keys FOR ALL TO saas_runtime
  USING (EXISTS (
    SELECT 1 FROM service_accounts
    WHERE service_accounts.id = api_keys.service_account_id
      AND service_accounts.organization_id = app_current_organization_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM service_accounts
    WHERE service_accounts.id = api_keys.service_account_id
      AND service_accounts.organization_id = app_current_organization_id()
  ));
CREATE POLICY audit_events_tenant ON audit_events FOR ALL TO saas_runtime
  USING (organization_id = app_current_organization_id())
  WITH CHECK (organization_id = app_current_organization_id());
