-- ========================================================================
-- 14 — Administration: catalog versions, staff invitations, customer
--      directory search, follow-up queue, outlet policies, subscription.
--
-- PRD: FR02 (invitations), FR04 (services/prices), FR05/FR07 (customers &
--      search), FR35 (follow-up queue), FR37/§19.2 (entitlements),
--      §10.1 (RBAC), §12.1 (immutable service_versions), §12.2 (customer
--      directory scope), §5.5 (ready/uncollected age).
--
-- Same rules as 03: every function is SECURITY DEFINER and checks its own
-- permission, because RLS protects rows but not business actions (§11.4).
-- SQLSTATE carries HTTP intent: PT400/PT401/PT403/PT404/PT409/PT422.
-- ========================================================================

-- No new extension is needed: sha256() and gen_random_uuid() are core.

-- ---------------------------------------------------------------- schema --

-- §12.2 — "cashiers see only customers created at, or with orders at,
-- authorized outlets". The creation outlet was not recorded before.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_outlet_id UUID REFERENCES outlets(id);
CREATE INDEX IF NOT EXISTS idx_customers_created_outlet ON customers (created_outlet_id);

-- §5.5 — the ready/uncollected threshold "is configurable, not universal".
-- One JSONB bag per outlet instead of a settings table nobody queries by key.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- FR02 — invitations expire after 72 hours; role and outlets are explicit.
-- Only the SHA-256 hash of the token is stored; the raw token is returned to
-- the inviter exactly once and never written to a log or audit payload.
CREATE TABLE IF NOT EXISTS staff_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    -- owner is deliberately not invitable: ownership comes from onboarding.
    role VARCHAR(50) NOT NULL CHECK (role IN ('supervisor', 'cashier', 'operator')),
    outlet_ids UUID[] NOT NULL DEFAULT '{}',
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
    expires_at TIMESTAMPTZ NOT NULL,
    invited_by UUID REFERENCES users(id),
    accepted_by UUID REFERENCES users(id),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_tenant ON staff_invitations (tenant_id, status, expires_at);

-- RLS on, no policy: the browser never reads this table directly, not even
-- the hash. Everything goes through the functions below.
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- §12.1 — service_versions are immutable snapshots referenced by orders.
-- A row that no order references yet may still be corrected; once an order
-- points at it, the only legal change is a new version row.
CREATE OR REPLACE FUNCTION app.deny_used_service_version_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM order_lines WHERE service_version_id = OLD.id) THEN
    RAISE EXCEPTION 'append_only: service_versions rows referenced by an order are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_versions_immutable_when_used ON service_versions;
CREATE TRIGGER service_versions_immutable_when_used
  BEFORE UPDATE OR DELETE ON service_versions
  FOR EACH ROW EXECUTE FUNCTION app.deny_used_service_version_mutation();

-- ------------------------------------------------------------- helpers ----

/** §10.1 "Manage services/prices": owner, or supervisor with outlet scope. */
CREATE OR REPLACE FUNCTION app.can_manage_catalog(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT app.role_in(p_tenant) IN ('owner', 'supervisor')
$$;

/** §10.1 "Manage tenant/billing": owner only. */
CREATE OR REPLACE FUNCTION app.can_manage_tenant(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT app.role_in(p_tenant) = 'owner'
$$;

/** FR05 — normalize an Indonesian phone to 62XXXXXXXXX; NULL when empty. */
CREATE OR REPLACE FUNCTION app.normalize_phone(p_phone TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN regexp_replace(p_phone, '\D', '', 'g') = '' THEN NULL
    WHEN regexp_replace(p_phone, '\D', '', 'g') LIKE '0%'
      THEN '62' || substring(regexp_replace(p_phone, '\D', '', 'g') FROM 2)
    WHEN regexp_replace(p_phone, '\D', '', 'g') LIKE '62%'
      THEN regexp_replace(p_phone, '\D', '', 'g')
    WHEN regexp_replace(p_phone, '\D', '', 'g') LIKE '8%'
      THEN '62' || regexp_replace(p_phone, '\D', '', 'g')
    ELSE regexp_replace(p_phone, '\D', '', 'g')
  END
$$;

-- ==========================================================================
-- FR04 — services and prices
-- ==========================================================================

/**
 * Catalog for one outlet: every service with its CURRENT (newest) version,
 * how many versions exist, and how many orders already reference the current
 * one. Archived services stay in the list so old receipts remain explainable.
 */
CREATE OR REPLACE FUNCTION list_services(p_outlet UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_result JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.is_active DESC, x.name), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      s.id                                        AS service_id,
      COALESCE(v.name, s.name)                    AS name,
      COALESCE(v.unit, s.unit)                    AS unit,
      (s.is_active AND COALESCE(v.is_active, FALSE)) AS is_active,
      v.id                                        AS current_version_id,
      COALESCE(v.price_per_unit_idr, 0)           AS price_per_unit_idr,
      COALESCE(v.min_grams, 0)                    AS min_grams,
      COALESCE(v.increment_grams, 100)            AS increment_grams,
      COALESCE(v.sla_hours, 48)                   AS sla_hours,
      COALESCE(v.workflow_steps, '[]'::jsonb)     AS workflow_steps,
      v.created_at                                AS version_since,
      COALESCE(c.n, 0)                            AS version_count,
      COALESCE(u.n, 0)                            AS orders_on_current_version
    FROM services s
    LEFT JOIN LATERAL (
      SELECT sv.* FROM service_versions sv
      WHERE sv.service_id = s.id
      ORDER BY sv.created_at DESC, sv.id DESC
      LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*) AS n FROM service_versions sv WHERE sv.service_id = s.id
    ) c ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*) AS n FROM order_lines ol WHERE ol.service_version_id = v.id
    ) u ON TRUE
    WHERE s.outlet_id = p_outlet
  ) x;

  RETURN jsonb_build_object('outlet_id', p_outlet, 'services', v_result);
END;
$$;

/**
 * FR04 — create a service or publish a NEW price version of one.
 *
 * Existing service_versions rows are never touched: a change (price, minimum,
 * increment, SLA, workflow, name, or archiving) always inserts a new row, so
 * old orders keep the snapshot they were priced with (§12.1).
 * p_service NULL creates the service; otherwise a new version is appended.
 */
CREATE OR REPLACE FUNCTION save_service_version(
  p_outlet UUID,
  p_name TEXT,
  p_unit TEXT,
  p_price_idr BIGINT,
  p_min_grams INT DEFAULT 0,
  p_increment_grams INT DEFAULT 100,
  p_sla_hours INT DEFAULT 48,
  p_workflow JSONB DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_service UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_replay JSONB;
  v_service UUID := p_service;
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_unit TEXT := lower(trim(COALESCE(p_unit, '')));
  v_workflow JSONB;
  v_step TEXT;
  v_version UUID;
  v_prev service_versions%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF NOT app.can_manage_catalog(v_tenant) THEN
    RAISE EXCEPTION 'catalog_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'PT400';
  END IF;
  IF v_unit NOT IN ('kg', 'piece') THEN
    RAISE EXCEPTION 'invalid_unit' USING ERRCODE = 'PT400';
  END IF;
  IF p_price_idr IS NULL OR p_price_idr < 0 THEN
    RAISE EXCEPTION 'price_must_not_be_negative' USING ERRCODE = 'PT400';
  END IF;
  IF COALESCE(p_min_grams, 0) < 0 THEN
    RAISE EXCEPTION 'min_must_not_be_negative' USING ERRCODE = 'PT400';
  END IF;
  IF COALESCE(p_increment_grams, 0) < 1 THEN
    RAISE EXCEPTION 'increment_must_be_positive' USING ERRCODE = 'PT400';
  END IF;
  IF COALESCE(p_sla_hours, 0) < 1 THEN
    RAISE EXCEPTION 'sla_must_be_positive' USING ERRCODE = 'PT400';
  END IF;

  v_workflow := COALESCE(
    p_workflow,
    '["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"]'::jsonb
  );
  IF jsonb_typeof(v_workflow) <> 'array' OR jsonb_array_length(v_workflow) < 2 THEN
    RAISE EXCEPTION 'invalid_workflow' USING ERRCODE = 'PT400';
  END IF;
  FOR v_step IN SELECT jsonb_array_elements_text(v_workflow) LOOP
    IF v_step NOT IN ('QUEUED', 'WASHING', 'DRYING', 'IRONING', 'FOLDING', 'QC', 'READY') THEN
      RAISE EXCEPTION 'invalid_workflow' USING ERRCODE = 'PT400';
    END IF;
  END LOOP;
  IF v_workflow->>0 <> 'QUEUED'
     OR v_workflow->>(jsonb_array_length(v_workflow) - 1) <> 'READY' THEN
    RAISE EXCEPTION 'invalid_workflow' USING ERRCODE = 'PT400';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_tenant, 'save_service_version', p_idempotency_key,
      jsonb_build_object(
        'outlet', p_outlet, 'service', p_service, 'name', v_name, 'unit', v_unit,
        'price', p_price_idr, 'min', p_min_grams, 'inc', p_increment_grams,
        'sla', p_sla_hours, 'workflow', v_workflow, 'active', p_is_active
      ));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  IF v_service IS NULL THEN
    INSERT INTO services (tenant_id, outlet_id, name, unit, is_active)
    VALUES (v_tenant, p_outlet, v_name, v_unit, COALESCE(p_is_active, TRUE))
    RETURNING id INTO v_service;
  ELSE
    -- The service row is the mutable container; the versions under it are not.
    SELECT * INTO v_prev FROM service_versions
     WHERE service_id = v_service
     ORDER BY created_at DESC, id DESC LIMIT 1;

    UPDATE services
       SET name = v_name, unit = v_unit, is_active = COALESCE(p_is_active, TRUE)
     WHERE id = v_service AND outlet_id = p_outlet;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'service_version_not_found' USING ERRCODE = 'PT404';
    END IF;
  END IF;

  INSERT INTO service_versions (
    tenant_id, outlet_id, service_id, name, unit,
    price_per_unit_idr, min_grams, increment_grams, sla_hours,
    workflow_steps, is_active
  ) VALUES (
    v_tenant, p_outlet, v_service, v_name, v_unit,
    p_price_idr, COALESCE(p_min_grams, 0), COALESCE(p_increment_grams, 100),
    COALESCE(p_sla_hours, 48), v_workflow, COALESCE(p_is_active, TRUE)
  ) RETURNING id INTO v_version;

  v_result := jsonb_build_object(
    'service_id', v_service,
    'version_id', v_version,
    'name', v_name,
    'unit', v_unit,
    'price_per_unit_idr', p_price_idr,
    'is_active', COALESCE(p_is_active, TRUE),
    'previous_version_id', v_prev.id
  );

  PERFORM app.record(
    v_tenant, p_outlet,
    CASE WHEN p_service IS NULL THEN 'service.created' ELSE 'service.version_published' END,
    'service_version', v_version,
    CASE WHEN v_prev.id IS NULL THEN NULL ELSE jsonb_build_object(
      'version_id', v_prev.id,
      'price_per_unit_idr', v_prev.price_per_unit_idr,
      'min_grams', v_prev.min_grams,
      'increment_grams', v_prev.increment_grams,
      'sla_hours', v_prev.sla_hours,
      'is_active', v_prev.is_active
    ) END,
    v_result, p_request_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_tenant, 'save_service_version', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- ==========================================================================
-- FR02 — staff invitations
-- ==========================================================================

/** Members and open invitations of a tenant. Never returns a token or hash. */
CREATE OR REPLACE FUNCTION list_staff(p_tenant UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_members JSONB;
  v_invites JSONB;
BEGIN
  IF NOT app.can_manage_catalog(p_tenant) THEN
    RAISE EXCEPTION 'staff_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', u.id,
      'full_name', u.full_name,
      'email', u.email,
      'role', m.role,
      'status', u.status,
      'is_self', u.id = app.user_id(),
      'outlets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'code', o.code) ORDER BY o.name)
        FROM outlets o
        WHERE o.tenant_id = p_tenant
          AND (m.role IN ('owner', 'supervisor')
               OR EXISTS (SELECT 1 FROM outlet_access oa
                          WHERE oa.outlet_id = o.id AND oa.user_id = u.id))
      ), '[]'::jsonb),
      'all_outlets', m.role IN ('owner', 'supervisor')
    ) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_members
  FROM memberships m
  JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = p_tenant;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'invitation_id', i.id,
      'email', i.email,
      'full_name', i.full_name,
      'role', i.role,
      'status', CASE
        WHEN i.status = 'PENDING' AND i.expires_at <= NOW() THEN 'EXPIRED'
        ELSE i.status END,
      'expires_at', i.expires_at,
      'created_at', i.created_at,
      'outlets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'code', o.code) ORDER BY o.name)
        FROM outlets o WHERE o.id = ANY (i.outlet_ids)
      ), '[]'::jsonb)
    ) ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_invites
  FROM staff_invitations i
  WHERE i.tenant_id = p_tenant AND i.status <> 'ACCEPTED';

  RETURN jsonb_build_object('members', v_members, 'invitations', v_invites);
END;
$$;

/**
 * FR02 — invite a staff member. Role and outlets are explicit, the link is
 * valid for 72 hours, and the raw token is returned exactly once: it is
 * hashed in the table and never appears in the audit payload.
 */
CREATE OR REPLACE FUNCTION create_staff_invitation(
  p_tenant UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_outlets JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_replay JSONB;
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_full_name, ''));
  v_role TEXT := lower(trim(COALESCE(p_role, '')));
  v_outlets UUID[];
  v_token TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ := NOW() + INTERVAL '72 hours';
  v_result JSONB;
BEGIN
  IF NOT app.can_manage_tenant(p_tenant) THEN
    RAISE EXCEPTION 'staff_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'PT400';
  END IF;
  IF position('@' IN v_email) < 2 OR position('.' IN split_part(v_email, '@', 2)) < 2 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'PT400';
  END IF;
  IF v_role NOT IN ('supervisor', 'cashier', 'operator') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = 'PT400';
  END IF;

  SELECT COALESCE(array_agg(o.id), ARRAY[]::uuid[])
    INTO v_outlets
  FROM outlets o
  WHERE o.tenant_id = p_tenant
    AND o.id::text IN (SELECT jsonb_array_elements_text(COALESCE(p_outlets, '[]'::jsonb)));

  -- Cashiers and operators are outlet-bound; supervisors reach the whole tenant.
  IF v_role IN ('cashier', 'operator') AND cardinality(v_outlets) = 0 THEN
    RAISE EXCEPTION 'outlet_required' USING ERRCODE = 'PT400';
  END IF;

  IF EXISTS (
    SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = p_tenant AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'already_a_member' USING ERRCODE = 'PT409';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(p_tenant, 'create_staff_invitation', p_idempotency_key,
      jsonb_build_object('email', v_email, 'role', v_role, 'outlets', to_jsonb(v_outlets)));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  -- Supersede any earlier pending invitation for the same address.
  UPDATE staff_invitations
     SET status = 'REVOKED', revoked_at = NOW()
   WHERE tenant_id = p_tenant AND lower(email) = v_email AND status = 'PENDING';

  -- 64 hex chars from two v4 UUIDs; stored only as a SHA-256 hash.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO staff_invitations (
    tenant_id, email, full_name, role, outlet_ids, token_hash, expires_at, invited_by
  ) VALUES (
    p_tenant, v_email, v_name, v_role, v_outlets,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires, app.user_id()
  ) RETURNING id INTO v_id;

  -- Audit records who was invited to what, never the token.
  PERFORM app.record(
    p_tenant, NULL, 'staff.invited', 'staff_invitation', v_id, NULL,
    jsonb_build_object('email', v_email, 'role', v_role, 'outlets', to_jsonb(v_outlets),
                       'expires_at', v_expires),
    p_request_id
  );

  v_result := jsonb_build_object(
    'invitation_id', v_id,
    'email', v_email,
    'role', v_role,
    'expires_at', v_expires,
    'invite_path', '/invite/' || v_token
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(p_tenant, 'create_staff_invitation', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

/** FR02 — revoke an invitation that has not been accepted yet. */
CREATE OR REPLACE FUNCTION revoke_staff_invitation(
  p_invitation UUID,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv staff_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM staff_invitations WHERE id = p_invitation FOR UPDATE;
  IF NOT FOUND OR NOT app.can_manage_tenant(v_inv.tenant_id) THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF v_inv.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'invitation_already_accepted' USING ERRCODE = 'PT409';
  END IF;

  UPDATE staff_invitations
     SET status = 'REVOKED', revoked_at = NOW()
   WHERE id = p_invitation;

  PERFORM app.record(v_inv.tenant_id, NULL, 'staff.invitation_revoked', 'staff_invitation',
                     p_invitation, jsonb_build_object('status', v_inv.status),
                     jsonb_build_object('status', 'REVOKED'), p_request_id);

  RETURN jsonb_build_object('invitation_id', p_invitation, 'status', 'REVOKED');
END;
$$;

/**
 * FR02 — revoke an accepted member's access. Dropping the membership and the
 * outlet rows makes app.role_in()/app.has_outlet() fail on the member's very
 * next request, so an existing session stops working immediately rather than
 * within the five minutes the PRD allows.
 */
CREATE OR REPLACE FUNCTION revoke_staff_access(
  p_tenant UUID,
  p_user UUID,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NOT app.can_manage_tenant(p_tenant) THEN
    RAISE EXCEPTION 'staff_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT role INTO v_role FROM memberships WHERE tenant_id = p_tenant AND user_id = p_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_revoke_owner' USING ERRCODE = 'PT422';
  END IF;

  DELETE FROM outlet_access WHERE tenant_id = p_tenant AND user_id = p_user;
  DELETE FROM memberships WHERE tenant_id = p_tenant AND user_id = p_user;

  PERFORM app.record(p_tenant, NULL, 'staff.access_revoked', 'membership', p_user,
                     jsonb_build_object('role', v_role), NULL, p_request_id);

  RETURN jsonb_build_object('user_id', p_user, 'status', 'REVOKED');
END;
$$;

/**
 * FR02 — the invited person accepts, signed in with the invited address.
 * Looks the invitation up by hash; an expired, revoked, or already accepted
 * one is refused.
 */
CREATE OR REPLACE FUNCTION accept_staff_invitation(
  p_token TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_auth_email TEXT;
  v_inv staff_invitations%ROWTYPE;
  v_user UUID;
  v_outlet UUID;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'PT401';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_inv FROM staff_invitations
   WHERE token_hash = encode(sha256(convert_to(trim(p_token), 'UTF8')), 'hex')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF v_inv.status = 'REVOKED' THEN
    RAISE EXCEPTION 'invitation_revoked' USING ERRCODE = 'PT409';
  END IF;
  IF v_inv.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'invitation_already_accepted' USING ERRCODE = 'PT409';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'invitation_expired' USING ERRCODE = 'PT409';
  END IF;

  SELECT email INTO v_auth_email FROM auth.users WHERE id = v_auth_uid;
  IF lower(COALESCE(v_auth_email, '')) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'PT403';
  END IF;

  SELECT id INTO v_user FROM users WHERE auth_subject = v_auth_uid::text;
  IF v_user IS NULL THEN
    INSERT INTO users (auth_subject, email, full_name, status)
    VALUES (v_auth_uid::text, v_inv.email, v_inv.full_name, 'ACTIVE')
    RETURNING id INTO v_user;
  END IF;

  INSERT INTO memberships (tenant_id, user_id, role)
  VALUES (v_inv.tenant_id, v_user, v_inv.role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  FOREACH v_outlet IN ARRAY v_inv.outlet_ids LOOP
    INSERT INTO outlet_access (tenant_id, user_id, outlet_id)
    VALUES (v_inv.tenant_id, v_user, v_outlet)
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE staff_invitations
     SET status = 'ACCEPTED', accepted_at = NOW(), accepted_by = v_user
   WHERE id = v_inv.id;

  PERFORM app.record(v_inv.tenant_id, NULL, 'staff.invitation_accepted', 'staff_invitation',
                     v_inv.id, NULL,
                     jsonb_build_object('user_id', v_user, 'role', v_inv.role), p_request_id);

  RETURN jsonb_build_object(
    'tenant_id', v_inv.tenant_id,
    'tenant_name', (SELECT name FROM tenants WHERE id = v_inv.tenant_id),
    'role', v_inv.role,
    'outlet_count', cardinality(v_inv.outlet_ids)
  );
END;
$$;

-- ==========================================================================
-- FR05 / FR07 — customer directory
-- ==========================================================================

/**
 * FR07 — search needs input: a query shorter than two characters returns an
 * empty list instead of dumping the contact book.
 * §12.2 — operators are refused outright; cashiers only see customers created
 * at, or with an order at, an outlet they are allowed into.
 */
CREATE OR REPLACE FUNCTION search_customers(
  p_outlet UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_q TEXT := trim(COALESCE(p_query, ''));
  v_digits TEXT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_money BOOLEAN;
  v_rows JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  v_role := app.role_in(v_tenant);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'customer_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object('customers', '[]'::jsonb, 'query_required', TRUE, 'limit', v_limit);
  END IF;

  v_money := app.can_see_money(v_tenant);
  v_digits := app.normalize_phone(v_q);

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.normalized_phone AS phone,
      c.notes,
      c.created_at,
      COALESCE(agg.orders_count, 0) AS orders_count,
      CASE WHEN v_money THEN COALESCE(agg.total_spent_idr, 0) END AS total_spent_idr,
      agg.last_order_at
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT count(*) AS orders_count,
             SUM(o.total_charges_idr) AS total_spent_idr,
             MAX(o.accepted_at) AS last_order_at
      FROM orders o
      WHERE o.customer_id = c.id AND app.has_outlet(o.outlet_id)
    ) agg ON TRUE
    WHERE c.tenant_id = v_tenant
      -- §12.2 directory scope
      AND (
        v_role IN ('owner', 'supervisor')
        OR (c.created_outlet_id IS NOT NULL AND app.has_outlet(c.created_outlet_id))
        OR EXISTS (SELECT 1 FROM orders o
                    WHERE o.customer_id = c.id AND app.has_outlet(o.outlet_id))
      )
      -- FR07: name prefix, normalized phone, or an exact receipt number
      AND (
        c.name ILIKE v_q || '%'
        OR (v_digits IS NOT NULL AND length(v_digits) >= 4
            AND app.normalize_phone(c.normalized_phone) LIKE '%' || v_digits || '%')
        OR EXISTS (SELECT 1 FROM orders o
                    WHERE o.customer_id = c.id AND upper(o.order_number) = upper(v_q)
                      AND app.has_outlet(o.outlet_id))
      )
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object(
    'customers', v_rows,
    'query_required', FALSE,
    'limit', v_limit,
    'shows_money', v_money
  );
END;
$$;

/** Same contract as before, plus §12.2's creation outlet for directory scope. */
CREATE OR REPLACE FUNCTION find_or_create_customer(
  p_outlet UUID,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_phone TEXT;
  v_cust customers%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL OR NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  v_role := app.role_in(v_tenant);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'customer_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'PT400';
  END IF;

  -- FR05 — normalize to 62… so the same number is not stored three ways.
  v_phone := app.normalize_phone(p_phone);

  IF v_phone IS NOT NULL THEN
    SELECT * INTO v_cust FROM customers
    WHERE tenant_id = v_tenant AND app.normalize_phone(normalized_phone) = v_phone
    LIMIT 1;
  END IF;

  IF v_cust.id IS NULL THEN
    INSERT INTO customers (tenant_id, name, normalized_phone, notes, created_outlet_id)
    VALUES (v_tenant, trim(p_name), v_phone, NULLIF(trim(p_notes), ''), p_outlet)
    RETURNING * INTO v_cust;
  END IF;

  RETURN jsonb_build_object(
    'id', v_cust.id,
    'tenant_id', v_cust.tenant_id,
    'name', v_cust.name,
    'normalized_phone', v_cust.normalized_phone,
    'notes', v_cust.notes
  );
END;
$$;

-- ==========================================================================
-- FR35 — follow-up queue
-- ==========================================================================

/**
 * Two real work lists for one outlet:
 *   ready_uncollected — still in custody, every work item finished; the age is
 *     counted in outlet-local calendar days from the moment the order became
 *     ready (§5.5), against a threshold configurable per outlet (default 3).
 *   outstanding — active orders with a positive ledger balance.
 * Reading it schedules nothing: FR35 keeps reminders manual.
 */
CREATE OR REPLACE FUNCTION list_follow_ups(p_outlet UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_tz TEXT;
  v_threshold INT;
  v_ready JSONB;
  v_outstanding JSONB;
BEGIN
  SELECT tenant_id, COALESCE(timezone, 'Asia/Jakarta'),
         COALESCE(NULLIF(settings->>'uncollected_threshold_days', '')::int, 3)
    INTO v_tenant, v_tz, v_threshold
  FROM outlets WHERE id = p_outlet;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF NOT app.can_see_money(v_tenant) THEN
    RAISE EXCEPTION 'money_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.days_ready DESC, x.order_number), '[]'::jsonb)
    INTO v_ready
  FROM (
    SELECT
      o.id AS order_id,
      o.order_number,
      cu.name AS customer_name,
      cu.normalized_phone AS customer_phone,
      svc.summary AS service_summary,
      pkg.rack_code,
      COALESCE(led.balance_idr, o.balance_idr) AS balance_idr,
      o.custody_state,
      ready.at AS current_ready_at,
      GREATEST(
        0,
        ((NOW() AT TIME ZONE v_tz)::date - (ready.at AT TIME ZONE v_tz)::date)
      ) AS days_ready,
      ((NOW() AT TIME ZONE v_tz)::date - (ready.at AT TIME ZONE v_tz)::date) >= v_threshold AS is_due,
      note.last_prepared_at,
      note.last_status AS last_message_status
    FROM orders o
    JOIN customers cu ON cu.id = o.customer_id
    LEFT JOIN LATERAL (
      -- §5.5 ready_at: the latest transition into READY, else the packing time.
      SELECT COALESCE(
        (SELECT MAX(we.created_at) FROM work_events we
          JOIN work_items wi ON wi.id = we.work_item_id
         WHERE wi.order_id = o.id AND we.to_stage = 'READY'),
        (SELECT MIN(fp.created_at) FROM final_packages fp WHERE fp.order_id = o.id)
      ) AS at
    ) ready ON TRUE
    LEFT JOIN LATERAL (
      SELECT fp.rack_code FROM final_packages fp
      WHERE fp.order_id = o.id ORDER BY fp.created_at DESC LIMIT 1
    ) pkg ON TRUE
    LEFT JOIN LATERAL (
      SELECT string_agg(sv.name, ', ' ORDER BY sv.name) AS summary
      FROM order_lines ol JOIN service_versions sv ON sv.id = ol.service_version_id
      WHERE ol.order_id = o.id
    ) svc ON TRUE
    LEFT JOIN LATERAL (
      SELECT balance_idr FROM v_order_ledger l WHERE l.order_id = o.id
    ) led ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(n.created_at) AS last_prepared_at,
             (SELECT n2.status FROM notification_logs n2
               WHERE n2.order_id = o.id ORDER BY n2.created_at DESC LIMIT 1) AS last_status
      FROM notification_logs n WHERE n.order_id = o.id
    ) note ON TRUE
    WHERE o.outlet_id = p_outlet
      AND o.lifecycle = 'ACTIVE'
      AND o.custody_state = 'IN_CUSTODY'
      AND ready.at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM work_items wi
        WHERE wi.order_id = o.id AND wi.stage NOT IN ('READY', 'CANCELLED')
      )
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(y)::jsonb ORDER BY y.balance_idr DESC), '[]'::jsonb)
    INTO v_outstanding
  FROM (
    SELECT
      o.id AS order_id,
      o.order_number,
      cu.name AS customer_name,
      cu.normalized_phone AS customer_phone,
      svc.summary AS service_summary,
      led.balance_idr,
      o.custody_state,
      o.accepted_at,
      note.last_prepared_at,
      note.last_status AS last_message_status
    FROM orders o
    JOIN customers cu ON cu.id = o.customer_id
    JOIN v_order_ledger led ON led.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT string_agg(sv.name, ', ' ORDER BY sv.name) AS summary
      FROM order_lines ol JOIN service_versions sv ON sv.id = ol.service_version_id
      WHERE ol.order_id = o.id
    ) svc ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(n.created_at) AS last_prepared_at,
             (SELECT n2.status FROM notification_logs n2
               WHERE n2.order_id = o.id ORDER BY n2.created_at DESC LIMIT 1) AS last_status
      FROM notification_logs n WHERE n.order_id = o.id
    ) note ON TRUE
    WHERE o.outlet_id = p_outlet
      AND o.lifecycle = 'ACTIVE'
      AND led.balance_idr > 0
  ) y;

  RETURN jsonb_build_object(
    'outlet_id', p_outlet,
    'threshold_days', v_threshold,
    'ready_uncollected', v_ready,
    'outstanding', v_outstanding
  );
END;
$$;

-- ==========================================================================
-- Outlet policies (FR04/FR22/FR35 thresholds) and FR37 entitlements
-- ==========================================================================

CREATE OR REPLACE FUNCTION get_outlet_settings(p_outlet UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings JSONB;
BEGIN
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;
  SELECT settings INTO v_settings FROM outlets WHERE id = p_outlet;
  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;

  RETURN jsonb_build_object(
    'outlet_id', p_outlet,
    'uncollected_threshold_days', COALESCE((v_settings->>'uncollected_threshold_days')::int, 3),
    'max_credit_limit_idr', COALESCE((v_settings->>'max_credit_limit_idr')::bigint, 100000),
    'compensation_policy', COALESCE(v_settings->>'compensation_policy', '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION update_outlet_settings(
  p_outlet UUID,
  p_threshold_days INT,
  p_max_credit_limit_idr BIGINT,
  p_compensation_policy TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_before JSONB;
  v_patch JSONB;
BEGIN
  SELECT tenant_id, settings INTO v_tenant, v_before FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF NOT app.can_manage_catalog(v_tenant) THEN
    RAISE EXCEPTION 'catalog_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF p_threshold_days IS NULL OR p_threshold_days < 1 OR p_threshold_days > 60 THEN
    RAISE EXCEPTION 'invalid_threshold_days' USING ERRCODE = 'PT400';
  END IF;
  IF p_max_credit_limit_idr IS NULL OR p_max_credit_limit_idr < 0 THEN
    RAISE EXCEPTION 'price_must_not_be_negative' USING ERRCODE = 'PT400';
  END IF;

  v_patch := jsonb_build_object(
    'uncollected_threshold_days', p_threshold_days,
    'max_credit_limit_idr', p_max_credit_limit_idr,
    'compensation_policy', COALESCE(trim(p_compensation_policy), '')
  );

  UPDATE outlets SET settings = COALESCE(settings, '{}'::jsonb) || v_patch WHERE id = p_outlet;

  PERFORM app.record(v_tenant, p_outlet, 'outlet.settings_updated', 'outlet', p_outlet,
                     v_before, v_patch, p_request_id);

  RETURN v_patch;
END;
$$;

/**
 * FR37 / §19.2 — plan state for the Settings page. Entitlement is separate
 * from laundry balances, and a restriction never deletes data: the copy that
 * says so lives in the UI, the flags that drive it live here.
 */
CREATE OR REPLACE FUNCTION get_subscription(p_tenant UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_outlets INT;
BEGIN
  IF NOT app.can_manage_tenant(p_tenant) THEN
    RAISE EXCEPTION 'billing_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT count(*) INTO v_outlets FROM outlets WHERE tenant_id = p_tenant;
  SELECT * INTO v_sub FROM subscriptions WHERE tenant_id = p_tenant;

  IF NOT FOUND THEN
    -- No billing row yet: report the default trial rather than inventing one.
    RETURN jsonb_build_object(
      'exists', FALSE,
      'plan', 'TRIAL',
      'status', 'ACTIVE',
      'max_outlets', 3,
      'outlet_count', v_outlets,
      'valid_until', NULL,
      'days_remaining', NULL,
      'blocks_new_orders', FALSE
    );
  END IF;

  RETURN jsonb_build_object(
    'exists', TRUE,
    'plan', v_sub.plan,
    'status', v_sub.status,
    'max_outlets', v_sub.max_outlets,
    'outlet_count', v_outlets,
    'valid_until', v_sub.valid_until,
    'days_remaining', GREATEST(0, (v_sub.valid_until::date - NOW()::date)),
    -- §19.2: after the grace period new orders stop; running orders do not.
    'blocks_new_orders', v_sub.status IN ('RESTRICTED', 'CANCELLED')
  );
END;
$$;

-- ------------------------------------------------------------------ grants --
REVOKE ALL ON FUNCTION
  list_services(UUID),
  save_service_version(UUID, TEXT, TEXT, BIGINT, INT, INT, INT, JSONB, BOOLEAN, UUID, TEXT, TEXT),
  list_staff(UUID),
  create_staff_invitation(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT),
  revoke_staff_invitation(UUID, TEXT),
  revoke_staff_access(UUID, UUID, TEXT),
  accept_staff_invitation(TEXT, TEXT),
  search_customers(UUID, TEXT, INT),
  find_or_create_customer(UUID, TEXT, TEXT, TEXT),
  list_follow_ups(UUID),
  get_outlet_settings(UUID),
  update_outlet_settings(UUID, INT, BIGINT, TEXT, TEXT),
  get_subscription(UUID)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  list_services(UUID),
  save_service_version(UUID, TEXT, TEXT, BIGINT, INT, INT, INT, JSONB, BOOLEAN, UUID, TEXT, TEXT),
  list_staff(UUID),
  create_staff_invitation(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT),
  revoke_staff_invitation(UUID, TEXT),
  revoke_staff_access(UUID, UUID, TEXT),
  accept_staff_invitation(TEXT, TEXT),
  search_customers(UUID, TEXT, INT),
  find_or_create_customer(UUID, TEXT, TEXT, TEXT),
  list_follow_ups(UUID),
  get_outlet_settings(UUID),
  update_outlet_settings(UUID, INT, BIGINT, TEXT, TEXT),
  get_subscription(UUID)
TO authenticated;
