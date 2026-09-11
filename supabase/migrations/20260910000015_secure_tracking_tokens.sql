-- ========================================================================
-- 15 — Secure Tracking Tokens & IDOR Prevention
-- Eliminates sequential order_number enumeration in public tracking.
-- Generates unguessable 64-char SHA256 tokens per order and enforces token expiry.
-- ========================================================================

-- 1. Ensure any historical orders have tracking tokens
INSERT INTO tracking_tokens (tenant_id, order_id, token, token_hash, expires_at)
SELECT
  o.tenant_id,
  o.id,
  encode(sha256((random()::text || clock_timestamp()::text || o.id::text)::bytea), 'hex'),
  encode(sha256((random()::text || clock_timestamp()::text || o.id::text)::bytea), 'hex'),
  NOW() + INTERVAL '90 days'
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM tracking_tokens tt WHERE tt.order_id = o.id
);

-- 2. Update confirm_order to create tracking token and return tracking_token in result
CREATE OR REPLACE FUNCTION confirm_order(
  p_outlet UUID,
  p_customer UUID,
  p_lines JSONB,
  p_discount_idr BIGINT,
  p_cash JSONB,              -- {applied_idr, tendered_idr, session_id} or NULL
  p_idempotency_key TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_replay JSONB;
  v_quote JSONB;
  v_line JSONB;
  v_number TEXT;
  v_order_id UUID;
  v_line_id UUID;
  v_wi_id UUID;
  v_sv service_versions%ROWTYPE;
  v_applied BIGINT;
  v_tendered BIGINT;
  v_session UUID;
  v_receipt_id UUID;
  v_tracking_token TEXT;
  v_ledger JSONB;
  v_result JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL OR NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  v_role := app.role_in(v_tenant);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'create_order_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF EXISTS (SELECT 1 FROM subscriptions WHERE tenant_id = v_tenant AND status = 'RESTRICTED') THEN
    RAISE EXCEPTION 'subscription_restricted' USING ERRCODE = 'PT422';
  END IF;

  v_replay := app.claim_idempotency(v_tenant, 'confirm_order', p_idempotency_key,
    jsonb_build_object('outlet', p_outlet, 'customer', p_customer, 'lines', p_lines,
                       'discount', p_discount_idr, 'cash', p_cash));
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  PERFORM 1 FROM customers WHERE id = p_customer AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_quote := quote_order(p_outlet, p_lines, p_discount_idr);
  v_number := app.allocate_order_number(p_outlet);

  INSERT INTO orders (tenant_id, outlet_id, customer_id, order_number, lifecycle,
                      original_promised_at, current_promised_at, created_by)
  VALUES (v_tenant, p_outlet, p_customer, v_number, 'ACTIVE',
          (v_quote->>'suggested_due_at')::timestamptz,
          (v_quote->>'suggested_due_at')::timestamptz,
          app.user_id())
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote->'lines') LOOP
    SELECT * INTO v_sv FROM service_versions WHERE id = (v_line->>'service_version_id')::uuid;

    INSERT INTO order_lines (tenant_id, order_id, service_version_id, actual_quantity,
                             billable_quantity, rate_per_unit_idr, subtotal_idr, due_at, notes)
    VALUES (v_tenant, v_order_id, v_sv.id,
            (v_line->>'actual_quantity')::int, (v_line->>'billable_quantity')::int,
            (v_line->>'rate_per_unit_idr')::bigint, (v_line->>'subtotal_idr')::bigint,
            (v_line->>'due_at')::timestamptz, v_line->>'notes')
    RETURNING id INTO v_line_id;

    INSERT INTO work_items (tenant_id, outlet_id, order_id, line_id, stage,
                            workflow_snapshot, due_at)
    VALUES (v_tenant, p_outlet, v_order_id, v_line_id, 'QUEUED',
            v_sv.workflow_steps, (v_line->>'due_at')::timestamptz)
    RETURNING id INTO v_wi_id;

    INSERT INTO intake_bags (tenant_id, order_id, work_item_id, bag_code)
    VALUES (v_tenant, v_order_id, v_wi_id, v_number || '-B' || lpad((
      SELECT COUNT(*) + 1 FROM intake_bags WHERE order_id = v_order_id)::text, 2, '0'));
  END LOOP;

  INSERT INTO charge_entries (tenant_id, order_id, kind, amount_idr, actor_id, reason)
  VALUES (v_tenant, v_order_id, 'INITIAL', (v_quote->>'subtotal_idr')::bigint, app.user_id(), 'Intake');

  IF (v_quote->>'discount_idr')::bigint > 0 THEN
    INSERT INTO charge_entries (tenant_id, order_id, kind, amount_idr, actor_id, reason)
    VALUES (v_tenant, v_order_id, 'CREDIT_ADJUSTMENT', (v_quote->>'discount_idr')::bigint,
            app.user_id(), 'Diskon tetap saat intake');
  END IF;

  IF p_cash IS NOT NULL AND (p_cash->>'applied_idr')::bigint > 0 THEN
    v_applied  := (p_cash->>'applied_idr')::bigint;
    v_tendered := COALESCE((p_cash->>'tendered_idr')::bigint, v_applied);
    v_session  := (p_cash->>'session_id')::uuid;

    IF v_tendered < v_applied THEN
      RAISE EXCEPTION 'tendered_less_than_applied' USING ERRCODE = 'PT400';
    END IF;
    IF v_applied > (v_quote->>'total_charges_idr')::bigint THEN
      RAISE EXCEPTION 'applied_exceeds_charges' USING ERRCODE = 'PT422';
    END IF;
    IF v_session IS NULL OR NOT EXISTS (
      SELECT 1 FROM cash_sessions WHERE id = v_session AND outlet_id = p_outlet AND status = 'OPEN'
    ) THEN
      RAISE EXCEPTION 'open_cash_session_required' USING ERRCODE = 'PT422';
    END IF;

    INSERT INTO receipts (tenant_id, order_id, amount_idr, method, verifier_id,
                          tendered_idr, change_idr, session_id)
    VALUES (v_tenant, v_order_id, v_applied, 'CASH', app.user_id(),
            v_tendered, v_tendered - v_applied, v_session)
    RETURNING id INTO v_receipt_id;

    INSERT INTO cash_movements (tenant_id, session_id, source_type, source_id, amount_signed_idr)
    VALUES (v_tenant, v_session, 'RECEIPT', v_receipt_id, v_applied);
  END IF;

  -- Generate opaque, unguessable public tracking token (FR33)
  v_tracking_token := encode(sha256((random()::text || clock_timestamp()::text || v_order_id::text)::bytea), 'hex');
  INSERT INTO tracking_tokens (tenant_id, order_id, token, token_hash, expires_at)
  VALUES (v_tenant, v_order_id, v_tracking_token, v_tracking_token, NOW() + INTERVAL '90 days');

  v_ledger := app.refresh_order_ledger(v_order_id);

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'tracking_token', v_tracking_token,
    'version', 1,
    'quote', v_quote,
    'ledger', v_ledger,
    'receipt_id', v_receipt_id
  );

  PERFORM app.record(v_tenant, p_outlet, 'ORDER_CONFIRMED', 'orders', v_order_id,
                     NULL, v_result, p_request_id, 'OrderAccepted', 1);
  PERFORM app.finish_idempotency(v_tenant, 'confirm_order', p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- 3. Secure get_public_tracking: Only allows lookup via opaque token with expiry check.
-- Sequential order_numbers are rejected to prevent public enumeration.
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
  -- Strict token lookup: only opaque token / hash with active expiration
  SELECT * INTO v_token_row
  FROM tracking_tokens
  WHERE (token = trim(p_token) OR token_hash = trim(p_token))
    AND expires_at > NOW()
  LIMIT 1;

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

GRANT EXECUTE ON FUNCTION get_public_tracking(TEXT) TO anon, authenticated;
