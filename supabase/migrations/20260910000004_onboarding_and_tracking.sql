-- ========================================================================
-- 04 — Onboarding, Auth context, and Public Tracking
-- PRD §7.1 FR01 Onboarding, §10.1 RBAC, §8.2 FR33 Public Tracking
-- ========================================================================

-- ------------------------------------------------------------- onboarding --
/**
 * Bootstraps a new tenant, initial outlet, owner user record, membership,
 * and default service catalog in a single atomic transaction.
 * Callable by authenticated users (during first-time onboarding).
 */
CREATE OR REPLACE FUNCTION bootstrap_tenant(
  p_business_name TEXT,
  p_outlet_name TEXT,
  p_timezone TEXT DEFAULT 'Asia/Jakarta',
  p_outlet_phone TEXT DEFAULT NULL,
  p_owner_full_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_auth_email TEXT;
  v_user_id UUID;
  v_tenant_id UUID;
  v_outlet_id UUID;
  v_outlet_code VARCHAR(50);
  v_srv_kiloan UUID;
  v_srv_express UUID;
  v_srv_iron UUID;
  v_srv_bedcover UUID;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'PT401';
  END IF;

  SELECT email INTO v_auth_email FROM auth.users WHERE id = v_auth_uid;

  -- 1. Ensure user row exists in public.users
  SELECT id INTO v_user_id FROM users WHERE auth_subject = v_auth_uid::text;
  IF v_user_id IS NULL THEN
    INSERT INTO users (auth_subject, email, full_name, status)
    VALUES (
      v_auth_uid::text,
      COALESCE(v_auth_email, 'user@laundryflow.id'),
      COALESCE(p_owner_full_name, 'Owner Laundry'),
      'ACTIVE'
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- 2. Create Tenant
  INSERT INTO tenants (name, status)
  VALUES (trim(p_business_name), 'ACTIVE')
  RETURNING id INTO v_tenant_id;

  -- 3. Create Membership as Owner
  INSERT INTO memberships (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_user_id, 'owner');

  -- 4. Create Initial Outlet
  v_outlet_code := UPPER(SUBSTRING(REGEXP_REPLACE(p_outlet_name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
  IF LENGTH(COALESCE(v_outlet_code, '')) < 2 THEN
    v_outlet_code := 'OUT1';
  END IF;

  INSERT INTO outlets (tenant_id, name, code, timezone, phone, address)
  VALUES (
    v_tenant_id,
    trim(p_outlet_name),
    v_outlet_code,
    COALESCE(p_timezone, 'Asia/Jakarta'),
    p_outlet_phone,
    'Outlet Utama'
  )
  RETURNING id INTO v_outlet_id;

  -- 5. Grant outlet access to owner
  INSERT INTO outlet_access (tenant_id, user_id, outlet_id)
  VALUES (v_tenant_id, v_user_id, v_outlet_id)
  ON CONFLICT DO NOTHING;

  -- 6. Seed Default Services Catalog (PRD §9.3 standard fixtures)
  -- Kiloan Reguler
  INSERT INTO services (tenant_id, outlet_id, name, unit, is_active)
  VALUES (v_tenant_id, v_outlet_id, 'Cuci Setrika Reguler', 'kg', TRUE)
  RETURNING id INTO v_srv_kiloan;

  INSERT INTO service_versions (
    tenant_id, outlet_id, service_id, name, unit,
    price_per_unit_idr, min_grams, increment_grams, sla_hours,
    workflow_steps, is_active
  ) VALUES (
    v_tenant_id, v_outlet_id, v_srv_kiloan, 'Cuci Setrika Reguler', 'kg',
    8000, 3000, 100, 48,
    '["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"]'::jsonb, TRUE
  );

  -- Kiloan Express
  INSERT INTO services (tenant_id, outlet_id, name, unit, is_active)
  VALUES (v_tenant_id, v_outlet_id, 'Cuci Setrika Express', 'kg', TRUE)
  RETURNING id INTO v_srv_express;

  INSERT INTO service_versions (
    tenant_id, outlet_id, service_id, name, unit,
    price_per_unit_idr, min_grams, increment_grams, sla_hours,
    workflow_steps, is_active
  ) VALUES (
    v_tenant_id, v_outlet_id, v_srv_express, 'Cuci Setrika Express', 'kg',
    15000, 3000, 100, 24,
    '["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"]'::jsonb, TRUE
  );

  -- Setrika Saja
  INSERT INTO services (tenant_id, outlet_id, name, unit, is_active)
  VALUES (v_tenant_id, v_outlet_id, 'Setrika Saja', 'kg', TRUE)
  RETURNING id INTO v_srv_iron;

  INSERT INTO service_versions (
    tenant_id, outlet_id, service_id, name, unit,
    price_per_unit_idr, min_grams, increment_grams, sla_hours,
    workflow_steps, is_active
  ) VALUES (
    v_tenant_id, v_outlet_id, v_srv_iron, 'Setrika Saja', 'kg',
    6000, 2000, 100, 24,
    '["QUEUED", "IRONING", "QC", "READY"]'::jsonb, TRUE
  );

  -- Bedcover Satuan
  INSERT INTO services (tenant_id, outlet_id, name, unit, is_active)
  VALUES (v_tenant_id, v_outlet_id, 'Bedcover King (Satuan)', 'piece', TRUE)
  RETURNING id INTO v_srv_bedcover;

  INSERT INTO service_versions (
    tenant_id, outlet_id, service_id, name, unit,
    price_per_unit_idr, min_grams, increment_grams, sla_hours,
    workflow_steps, is_active
  ) VALUES (
    v_tenant_id, v_outlet_id, v_srv_bedcover, 'Bedcover King (Satuan)', 'piece',
    35000, 0, 1, 48,
    '["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"]'::jsonb, TRUE
  );

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'tenant_name', p_business_name,
    'outlet_id', v_outlet_id,
    'outlet_code', v_outlet_code,
    'role', 'owner'
  );
END;
$$;

-- ----------------------------------------------------------- session context --
/**
 * Retrieves the current caller's profile, memberships, and available outlets.
 */
CREATE OR REPLACE FUNCTION get_my_context()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := app.user_id();
  v_res JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT jsonb_build_object(
    'authenticated', true,
    'user', (
      SELECT jsonb_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name)
      FROM users u WHERE u.id = v_user_id
    ),
    'memberships', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'tenant_id', m.tenant_id,
          'tenant_name', t.name,
          'role', m.role,
          'outlets', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object('id', o.id, 'name', o.name, 'code', o.code, 'timezone', o.timezone)
            ), '[]'::jsonb)
            FROM outlets o
            WHERE o.tenant_id = m.tenant_id
              AND (
                m.role IN ('owner', 'supervisor')
                OR EXISTS (SELECT 1 FROM outlet_access oa WHERE oa.outlet_id = o.id AND oa.user_id = v_user_id)
              )
          )
        )
      )
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = v_user_id AND t.status = 'ACTIVE'
    ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- ----------------------------------------------------------- public tracking --
/**
 * PRD §8.2 / FR33 / FR34 — Public tracking endpoint.
 * Given an opaque tracking token, returns minimal order summary, stages, and outlet contact.
 * Safe to be executed by anon. Never leaks customer identity or internal audit notes.
 */
CREATE OR REPLACE FUNCTION get_public_tracking(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token_row tracking_tokens%ROWTYPE;
  v_order orders%ROWTYPE;
  v_outlet outlets%ROWTYPE;
  v_lines JSONB;
  v_work_items JSONB;
  v_balance BIGINT;
BEGIN
  SELECT * INTO v_token_row FROM tracking_tokens WHERE token = trim(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_token_row.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_outlet FROM outlets WHERE id = v_order.outlet_id;

  SELECT balance_idr INTO v_balance FROM v_order_ledger WHERE order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'service_name', sv.name,
      'unit', sv.unit,
      'actual_quantity', ol.actual_quantity,
      'subtotal_idr', ol.subtotal_idr
    )
  ), '[]'::jsonb) INTO v_lines
  FROM order_lines ol
  JOIN service_versions sv ON sv.id = ol.service_version_id
  WHERE ol.order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'stage', wi.stage,
      'workflow', wi.workflow_snapshot,
      'due_at', wi.due_at
    )
  ), '[]'::jsonb) INTO v_work_items
  FROM work_items wi
  WHERE wi.order_id = v_order.id;

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'outlet_name', v_outlet.name,
    'outlet_phone', v_outlet.phone,
    'outlet_address', v_outlet.address,
    'custody_state', v_order.custody_state,
    'accepted_at', v_order.accepted_at,
    'promised_at', v_order.current_promised_at,
    'total_charges_idr', v_order.total_charges_idr,
    'balance_idr', COALESCE(v_balance, v_order.balance_idr),
    'lines', v_lines,
    'work_items', v_work_items
  );
END;
$$;

-- -------------------------------------------------------- customer lookup --
/**
 * Finds or creates a customer within caller's tenant.
 */
CREATE OR REPLACE FUNCTION find_or_create_customer(
  p_outlet UUID,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
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

  IF p_phone IS NOT NULL AND length(trim(p_phone)) > 0 THEN
    SELECT * INTO v_cust FROM customers
    WHERE tenant_id = v_tenant AND normalized_phone = trim(p_phone)
    LIMIT 1;
  END IF;

  IF v_cust.id IS NULL THEN
    INSERT INTO customers (tenant_id, name, normalized_phone, notes)
    VALUES (v_tenant, trim(p_name), NULLIF(trim(p_phone), ''), NULLIF(trim(p_notes), ''))
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

-- ----------------------------------------------------------- pack and rack --
/**
 * Records final package and rack allocation prior to moving to READY.
 */
CREATE OR REPLACE FUNCTION pack_and_rack_order(
  p_work_item UUID,
  p_rack_code TEXT,
  p_package_code TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wi work_items%ROWTYPE;
  v_pkg_code TEXT;
  v_pkg_id UUID;
BEGIN
  SELECT * INTO v_wi FROM work_items WHERE id = p_work_item;
  IF NOT FOUND OR NOT app.has_outlet(v_wi.outlet_id) THEN
    RAISE EXCEPTION 'work_item_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF p_rack_code IS NULL OR length(trim(p_rack_code)) = 0 THEN
    RAISE EXCEPTION 'rack_code_required' USING ERRCODE = 'PT400';
  END IF;

  v_pkg_code := COALESCE(NULLIF(trim(p_package_code), ''), 'PKG-' || SUBSTRING(v_wi.order_id::text FROM 1 FOR 8) || '-' || (FLOOR(RANDOM() * 900 + 100))::text);

  INSERT INTO final_packages (tenant_id, order_id, package_code, rack_code, custody_state, created_by)
  VALUES (v_wi.tenant_id, v_wi.order_id, v_pkg_code, trim(p_rack_code), 'IN_CUSTODY', app.user_id())
  RETURNING id INTO v_pkg_id;

  RETURN jsonb_build_object(
    'package_id', v_pkg_id,
    'order_id', v_wi.order_id,
    'rack_code', trim(p_rack_code),
    'package_code', v_pkg_code
  );
END;
$$;

-- ------------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  bootstrap_tenant(TEXT, TEXT, TEXT, TEXT, TEXT),
  get_my_context(),
  get_public_tracking(TEXT),
  find_or_create_customer(UUID, TEXT, TEXT, TEXT),
  pack_and_rack_order(UUID, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bootstrap_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_context() TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_tracking(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION find_or_create_customer(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pack_and_rack_order(UUID, TEXT, TEXT) TO authenticated;


