-- ========================================================================
-- 03 — Server-side commands
-- PRD §9.1 pricing, §11.2 intake flow, §13.1 endpoints, §13.2 races,
--     §13.3 idempotency, §13.4 internal events
--
-- Every function here is SECURITY DEFINER and performs its own permission
-- check, because RLS protects rows but not business actions (§11.4). Money is
-- computed here, never accepted from the client (§11.1 "must not: be the final
-- source of prices/balances").
--
-- Error contract (§13.1): SQLSTATE carries the HTTP intent.
--   PT400 validation · PT403 permission · PT404 not found
--   PT409 version/idempotency conflict · PT422 invalid state
-- ========================================================================

-- ---------------------------------------------------------------- pricing --
-- §9.1: billable = ceil(max(actual, minimum) / increment) * increment
CREATE OR REPLACE FUNCTION calc_billable_grams(p_actual INT, p_min INT, p_increment INT)
RETURNS INT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_actual <= 0 THEN 0
    ELSE CEIL(GREATEST(p_actual, COALESCE(p_min, 0))::numeric / GREATEST(COALESCE(p_increment, 1), 1))::int
         * GREATEST(COALESCE(p_increment, 1), 1)
  END
$$;

-- §9.1: line_gross = round_half_up(billable_grams * rate / 1000). Numeric, never
-- binary floating point.
CREATE OR REPLACE FUNCTION calc_line_gross(p_unit TEXT, p_billable INT, p_rate BIGINT)
RETURNS BIGINT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_unit = 'kg' THEN ROUND(p_billable::numeric * p_rate / 1000)::bigint
    ELSE p_billable::bigint * p_rate
  END
$$;

/**
 * Server quote. Input lines: [{ service_version_id, actual_quantity, notes }].
 * Returns the priced lines plus totals; creates nothing (§13.1 POST /orders/quote).
 */
CREATE OR REPLACE FUNCTION quote_order(p_outlet UUID, p_lines JSONB, p_discount_idr BIGINT DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line JSONB;
  v_sv service_versions%ROWTYPE;
  v_actual INT;
  v_billable INT;
  v_subtotal BIGINT;
  v_lines JSONB := '[]'::jsonb;
  v_sum BIGINT := 0;
  v_max_sla INT := 0;
  v_discount BIGINT;
BEGIN
  IF NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_required' USING ERRCODE = 'PT400';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_sv FROM service_versions
      WHERE id = (v_line->>'service_version_id')::uuid AND outlet_id = p_outlet;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'service_version_not_found' USING ERRCODE = 'PT404';
    END IF;
    IF NOT v_sv.is_active THEN
      RAISE EXCEPTION 'service_version_inactive' USING ERRCODE = 'PT422';
    END IF;

    v_actual := (v_line->>'actual_quantity')::int;
    IF v_actual IS NULL OR v_actual <= 0 THEN
      RAISE EXCEPTION 'quantity_must_be_positive' USING ERRCODE = 'PT400';
    END IF;

    v_billable := CASE WHEN v_sv.unit = 'kg'
      THEN calc_billable_grams(v_actual, v_sv.min_grams, v_sv.increment_grams)
      ELSE v_actual END;
    v_subtotal := calc_line_gross(v_sv.unit, v_billable, v_sv.price_per_unit_idr);

    v_sum := v_sum + v_subtotal;
    v_max_sla := GREATEST(v_max_sla, v_sv.sla_hours);

    v_lines := v_lines || jsonb_build_object(
      'service_version_id', v_sv.id,
      'service_name', v_sv.name,
      'unit', v_sv.unit,
      'actual_quantity', v_actual,
      'billable_quantity', v_billable,
      'rate_per_unit_idr', v_sv.price_per_unit_idr,
      'subtotal_idr', v_subtotal,
      'due_at', NOW() + make_interval(hours => v_sv.sla_hours),
      'notes', v_line->>'notes'
    );
  END LOOP;

  -- §9.1: a fixed discount can never exceed the subtotal.
  v_discount := LEAST(GREATEST(COALESCE(p_discount_idr, 0), 0), v_sum);

  RETURN jsonb_build_object(
    'lines', v_lines,
    'subtotal_idr', v_sum,
    'discount_idr', v_discount,
    'total_charges_idr', v_sum - v_discount,
    'suggested_due_at', NOW() + make_interval(hours => GREATEST(v_max_sla, 1))
  );
END;
$$;

-- ------------------------------------------------------- order numbering --
-- §12.2 — display numbers look like SB01-260909-000123, are per outlet, and
-- need not be gapless. The counter row is locked, so concurrent intakes queue.
CREATE OR REPLACE FUNCTION app.allocate_order_number(p_outlet UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT;
  v_tz TEXT;
  v_day DATE;
  v_seq INT;
BEGIN
  SELECT code, timezone INTO v_code, v_tz FROM outlets WHERE id = p_outlet;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_day := (NOW() AT TIME ZONE COALESCE(v_tz, 'Asia/Jakarta'))::date;

  INSERT INTO outlet_number_counters (outlet_id, day, last_seq)
  VALUES (p_outlet, v_day, 1)
  ON CONFLICT (outlet_id, day)
  DO UPDATE SET last_seq = outlet_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_code || '-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

-- ---------------------------------------------------------- idempotency ---
-- §13.3 — same key + same payload replays the original result; same key with a
-- different payload is a conflict; a key whose command has not finished yet is
-- also a conflict rather than a second execution.
CREATE OR REPLACE FUNCTION app.claim_idempotency(
  p_tenant UUID, p_command TEXT, p_key TEXT, p_payload JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hash TEXT := md5(p_payload::text);
  v_row idempotency_records%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = 'PT400';
  END IF;

  INSERT INTO idempotency_records (tenant_id, actor_id, command, idempotency_key, payload_hash)
  VALUES (p_tenant, app.user_id(), p_command, p_key, v_hash)
  ON CONFLICT (tenant_id, actor_id, command, idempotency_key) DO NOTHING;

  IF FOUND THEN
    RETURN NULL; -- first execution, caller proceeds
  END IF;

  SELECT * INTO v_row FROM idempotency_records
   WHERE tenant_id = p_tenant AND actor_id = app.user_id()
     AND command = p_command AND idempotency_key = p_key
   FOR UPDATE;

  IF v_row.payload_hash <> v_hash THEN
    RAISE EXCEPTION 'idempotency_payload_mismatch' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.result_ref IS NULL THEN
    RAISE EXCEPTION 'idempotency_in_flight' USING ERRCODE = 'PT409';
  END IF;

  RETURN v_row.result_ref;
END;
$$;

CREATE OR REPLACE FUNCTION app.finish_idempotency(
  p_tenant UUID, p_command TEXT, p_key TEXT, p_result JSONB
) RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE idempotency_records SET result_ref = p_result
   WHERE tenant_id = p_tenant AND actor_id = app.user_id()
     AND command = p_command AND idempotency_key = p_key
$$;

-- ---------------------------------------------------------- audit/outbox ---
CREATE OR REPLACE FUNCTION app.record(
  p_tenant UUID, p_outlet UUID, p_action TEXT, p_entity TEXT, p_entity_id UUID,
  p_before JSONB, p_after JSONB, p_request_id TEXT,
  p_event TEXT DEFAULT NULL, p_version INT DEFAULT 1
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_events (tenant_id, outlet_id, actor_id, action, entity, entity_id,
                            payload_before, payload_after, request_id)
  VALUES (p_tenant, p_outlet, app.user_id(), p_action, p_entity, p_entity_id,
          p_before, p_after, p_request_id);

  IF p_event IS NOT NULL THEN
    INSERT INTO outbox_events (tenant_id, aggregate_id, aggregate_version, type, payload)
    VALUES (p_tenant, p_entity_id, p_version, p_event, COALESCE(p_after, '{}'::jsonb));
  END IF;
END;
$$;

-- ------------------------------------------------------- ledger refresher ---
-- Recomputes the cached balance/settlement on orders from the ledger view.
-- §12.2: "cached balances must reconcile to the ledger".
CREATE OR REPLACE FUNCTION app.refresh_order_ledger(p_order UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l RECORD; v_status TEXT;
BEGIN
  SELECT * INTO v_l FROM v_order_ledger WHERE order_id = p_order;

  v_status := CASE
    WHEN v_l.balance_idr < 0 THEN 'CREDIT_DUE'
    WHEN v_l.balance_idr > 0 THEN CASE WHEN v_l.net_received_idr > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
    WHEN v_l.net_charges_idr = 0 THEN 'ZERO_CHARGE'
    ELSE 'SETTLED'
  END;

  UPDATE orders SET
    total_charges_idr = v_l.net_charges_idr,
    paid_amount_idr   = GREATEST(0, v_l.net_received_idr),
    balance_idr       = v_l.balance_idr,
    settlement_status = v_status,
    updated_at        = NOW()
  WHERE id = p_order;

  RETURN jsonb_build_object(
    'net_charges_idr', v_l.net_charges_idr,
    'net_received_idr', v_l.net_received_idr,
    'balance_idr', v_l.balance_idr,
    'settlement_status', v_status
  );
END;
$$;

-- ============================ COMMAND: confirm order ======================
-- §11.2 — one transaction: idempotency, number, order, lines, bags, work items,
-- charges, optional cash receipt, cash movement, audit, outbox.
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

  v_replay := app.claim_idempotency(v_tenant, 'confirm_order', p_idempotency_key,
    jsonb_build_object('outlet', p_outlet, 'customer', p_customer, 'lines', p_lines,
                       'discount', p_discount_idr, 'cash', p_cash));
  IF v_replay IS NOT NULL THEN
    RETURN v_replay; -- §13.3 replayed result, no second order
  END IF;

  PERFORM 1 FROM customers WHERE id = p_customer AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'PT404';
  END IF;

  -- Server recalculation. The client's numbers are never trusted (§11.1).
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

    -- §5.3 — the workflow is snapshotted now; later catalog edits cannot reroute it.
    INSERT INTO work_items (tenant_id, outlet_id, order_id, line_id, stage,
                            workflow_snapshot, due_at)
    VALUES (v_tenant, p_outlet, v_order_id, v_line_id, 'QUEUED',
            v_sv.workflow_steps, (v_line->>'due_at')::timestamptz)
    RETURNING id INTO v_wi_id;

    -- FR11 — at least one bag per work item, unique inside the tenant.
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

  -- Optional immediate cash. §9.2: only the applied amount becomes a receipt;
  -- the rest is change handed back.
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

  v_ledger := app.refresh_order_ledger(v_order_id);

  v_result := jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
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

-- ==================== COMMAND: advance a work item stage ==================
-- §13.2 — optimistic locking through expected_version; never last-write-wins.
CREATE OR REPLACE FUNCTION advance_work_item(
  p_work_item UUID,
  p_expected_version INT,
  p_to_stage TEXT,
  p_reason TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wi work_items%ROWTYPE;
  v_role TEXT;
  v_steps TEXT[];
  v_idx INT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_wi FROM work_items WHERE id = p_work_item FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_wi.outlet_id) THEN
    RAISE EXCEPTION 'work_item_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_role := app.role_in(v_wi.tenant_id);
  IF v_role NOT IN ('owner', 'supervisor', 'operator', 'cashier') THEN
    RAISE EXCEPTION 'production_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF v_wi.version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  SELECT array_agg(value::text ORDER BY ordinality) INTO v_steps
    FROM jsonb_array_elements_text(v_wi.workflow_snapshot) WITH ORDINALITY;

  v_idx := array_position(v_steps, v_wi.stage);
  IF v_idx IS NULL OR v_idx >= array_length(v_steps, 1) THEN
    RAISE EXCEPTION 'no_next_stage' USING ERRCODE = 'PT422';
  END IF;
  IF v_steps[v_idx + 1] <> p_to_stage THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'PT422';
  END IF;

  -- §5.3 — READY needs QC and a packed, racked package first.
  IF p_to_stage = 'READY' AND NOT EXISTS (
    SELECT 1 FROM final_packages WHERE order_id = v_wi.order_id
  ) THEN
    RAISE EXCEPTION 'package_and_rack_required' USING ERRCODE = 'PT422';
  END IF;

  UPDATE work_items
     SET stage = p_to_stage, version = version + 1, updated_at = NOW()
   WHERE id = p_work_item AND version = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO work_events (tenant_id, work_item_id, from_stage, to_stage, actor_id, reason)
  VALUES (v_wi.tenant_id, p_work_item, v_wi.stage, p_to_stage, app.user_id(), p_reason);

  v_result := jsonb_build_object(
    'work_item_id', p_work_item,
    'stage', p_to_stage,
    'version', v_wi.version + 1
  );

  PERFORM app.record(v_wi.tenant_id, v_wi.outlet_id, 'WORK_STAGE_CHANGED', 'work_items',
                     p_work_item, jsonb_build_object('stage', v_wi.stage), v_result,
                     p_request_id, 'WorkStageChanged', v_wi.version + 1);
  RETURN v_result;
END;
$$;

-- ================= COMMAND: payment attempt + confirmation ================
-- FR26 — a transfer/QRIS claim is an attempt. It touches no money until a
-- permitted person says the bank activity matches.
CREATE OR REPLACE FUNCTION create_payment_attempt(
  p_order UUID, p_method TEXT, p_amount BIGINT, p_reference TEXT,
  p_idempotency_key TEXT, p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_replay JSONB;
  v_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.can_see_money(v_o.tenant_id) THEN
    RAISE EXCEPTION 'money_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = 'PT400';
  END IF;

  v_replay := app.claim_idempotency(v_o.tenant_id, 'create_payment_attempt', p_idempotency_key,
    jsonb_build_object('order', p_order, 'method', p_method, 'amount', p_amount));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  INSERT INTO payment_attempts (tenant_id, order_id, method, amount_idr, reference, created_by)
  VALUES (v_o.tenant_id, p_order, p_method, p_amount, p_reference, app.user_id())
  RETURNING id INTO v_id;

  v_result := jsonb_build_object('attempt_id', v_id, 'status', 'PENDING_VERIFICATION');

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'PAYMENT_ATTEMPT_CREATED', 'payment_attempts',
                     v_id, NULL, v_result, p_request_id);
  PERFORM app.finish_idempotency(v_o.tenant_id, 'create_payment_attempt', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_payment_attempt(
  p_attempt UUID, p_idempotency_key TEXT, p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a payment_attempts%ROWTYPE;
  v_o orders%ROWTYPE;
  v_replay JSONB;
  v_receipt UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_a FROM payment_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_o FROM orders WHERE id = v_a.order_id FOR UPDATE;
  IF NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE = 'PT404';
  END IF;
  -- §10.1 — verifying transfers is owner/supervisor work by default.
  IF app.role_in(v_a.tenant_id) NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'verify_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF v_a.status <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'attempt_already_decided' USING ERRCODE = 'PT422';
  END IF;

  v_replay := app.claim_idempotency(v_a.tenant_id, 'confirm_payment_attempt', p_idempotency_key,
    jsonb_build_object('attempt', p_attempt));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  UPDATE payment_attempts
     SET status = 'CONFIRMED', decided_by = app.user_id(), decided_at = NOW()
   WHERE id = p_attempt;

  INSERT INTO receipts (tenant_id, order_id, amount_idr, method, verifier_id, reference, source_attempt_id)
  VALUES (v_a.tenant_id, v_a.order_id, v_a.amount_idr, v_a.method, app.user_id(), v_a.reference, v_a.id)
  RETURNING id INTO v_receipt;

  v_result := jsonb_build_object('receipt_id', v_receipt,
                                 'ledger', app.refresh_order_ledger(v_a.order_id));

  PERFORM app.record(v_a.tenant_id, v_o.outlet_id, 'PAYMENT_CONFIRMED', 'receipts', v_receipt,
                     NULL, v_result, p_request_id, 'PaymentConfirmed', 1);
  PERFORM app.finish_idempotency(v_a.tenant_id, 'confirm_payment_attempt', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

-- ======================= COMMAND: cash receipt ============================
CREATE OR REPLACE FUNCTION record_cash_receipt(
  p_order UUID, p_applied_idr BIGINT, p_tendered_idr BIGINT, p_session UUID,
  p_idempotency_key TEXT, p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_replay JSONB;
  v_balance BIGINT;
  v_receipt UUID;
  v_result JSONB;
BEGIN
  -- §13.2 — lock the order first, then re-read the balance under that lock.
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT app.can_see_money(v_o.tenant_id) THEN
    RAISE EXCEPTION 'money_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF p_applied_idr IS NULL OR p_applied_idr <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = 'PT400';
  END IF;
  IF COALESCE(p_tendered_idr, p_applied_idr) < p_applied_idr THEN
    RAISE EXCEPTION 'tendered_less_than_applied' USING ERRCODE = 'PT400';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cash_sessions
                  WHERE id = p_session AND outlet_id = v_o.outlet_id AND status = 'OPEN') THEN
    RAISE EXCEPTION 'open_cash_session_required' USING ERRCODE = 'PT422';
  END IF;

  v_replay := app.claim_idempotency(v_o.tenant_id, 'record_cash_receipt', p_idempotency_key,
    jsonb_build_object('order', p_order, 'applied', p_applied_idr, 'session', p_session));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT balance_idr INTO v_balance FROM v_order_ledger WHERE order_id = p_order;
  IF p_applied_idr > v_balance THEN
    -- §13.2 — the second concurrent settlement sees the updated balance and stops.
    RAISE EXCEPTION 'applied_exceeds_balance' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO receipts (tenant_id, order_id, amount_idr, method, verifier_id,
                        tendered_idr, change_idr, session_id)
  VALUES (v_o.tenant_id, p_order, p_applied_idr, 'CASH', app.user_id(),
          COALESCE(p_tendered_idr, p_applied_idr),
          COALESCE(p_tendered_idr, p_applied_idr) - p_applied_idr, p_session)
  RETURNING id INTO v_receipt;

  INSERT INTO cash_movements (tenant_id, session_id, source_type, source_id, amount_signed_idr)
  VALUES (v_o.tenant_id, p_session, 'RECEIPT', v_receipt, p_applied_idr);

  v_result := jsonb_build_object(
    'receipt_id', v_receipt,
    'change_idr', COALESCE(p_tendered_idr, p_applied_idr) - p_applied_idr,
    'ledger', app.refresh_order_ledger(p_order));

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'CASH_RECEIPT', 'receipts', v_receipt,
                     NULL, v_result, p_request_id, 'PaymentConfirmed', 1);
  PERFORM app.finish_idempotency(v_o.tenant_id, 'record_cash_receipt', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

-- ========================= COMMAND: handover ==============================
-- §5.4 / FR21 / FR22 — all packages together, balance settled or an approved
-- credit release with a reason, exactly one handover row.
CREATE OR REPLACE FUNCTION handover_order(
  p_order UUID,
  p_expected_version INT,
  p_receiver TEXT,
  p_is_representative BOOLEAN,
  p_credit_reason TEXT,
  p_idempotency_key TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_role TEXT;
  v_replay JSONB;
  v_balance BIGINT;
  v_credit_limit BIGINT := 100000; -- FR22 limit; outlet policy overrides this later
  v_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_role := app.role_in(v_o.tenant_id);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'handover_forbidden' USING ERRCODE = 'PT403';
  END IF;
  IF v_o.version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;
  IF v_o.custody_state = 'HANDED_OVER' THEN
    RAISE EXCEPTION 'already_handed_over' USING ERRCODE = 'PT422';
  END IF;
  IF p_receiver IS NULL OR length(trim(p_receiver)) = 0 THEN
    RAISE EXCEPTION 'receiver_required' USING ERRCODE = 'PT400';
  END IF;

  -- §6.3 invariant 8: ready is not handed over, and every work item must be ready.
  IF EXISTS (SELECT 1 FROM work_items
              WHERE order_id = p_order AND stage NOT IN ('READY', 'CANCELLED')) THEN
    RAISE EXCEPTION 'work_not_ready' USING ERRCODE = 'PT422';
  END IF;

  v_replay := app.claim_idempotency(v_o.tenant_id, 'handover_order', p_idempotency_key,
    jsonb_build_object('order', p_order, 'receiver', p_receiver));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT balance_idr INTO v_balance FROM v_order_ledger WHERE order_id = p_order;

  IF v_balance > 0 THEN
    IF v_role NOT IN ('owner', 'supervisor') THEN
      RAISE EXCEPTION 'credit_release_forbidden' USING ERRCODE = 'PT403';
    END IF;
    IF p_credit_reason IS NULL OR length(trim(p_credit_reason)) = 0 THEN
      RAISE EXCEPTION 'credit_reason_required' USING ERRCODE = 'PT400';
    END IF;
    IF v_balance > v_credit_limit THEN
      RAISE EXCEPTION 'credit_limit_exceeded' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  INSERT INTO handovers (tenant_id, order_id, receiver_name, is_representative, actor_id)
  VALUES (v_o.tenant_id, p_order, trim(p_receiver), COALESCE(p_is_representative, FALSE), app.user_id())
  RETURNING id INTO v_id;

  UPDATE orders
     SET custody_state = 'HANDED_OVER', version = version + 1, updated_at = NOW()
   WHERE id = p_order AND version = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  UPDATE final_packages SET custody_state = 'HANDED_OVER' WHERE order_id = p_order;

  v_result := jsonb_build_object(
    'handover_id', v_id,
    'version', v_o.version + 1,
    'balance_idr', v_balance,
    'credit_release', v_balance > 0
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'ORDER_HANDED_OVER', 'orders', p_order,
                     jsonb_build_object('custody_state', v_o.custody_state), v_result,
                     p_request_id, 'OrderHandedOver', v_o.version + 1);
  PERFORM app.finish_idempotency(v_o.tenant_id, 'handover_order', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  quote_order(UUID, JSONB, BIGINT),
  confirm_order(UUID, UUID, JSONB, BIGINT, JSONB, TEXT, TEXT),
  advance_work_item(UUID, INT, TEXT, TEXT, TEXT),
  create_payment_attempt(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT),
  confirm_payment_attempt(UUID, TEXT, TEXT),
  record_cash_receipt(UUID, BIGINT, BIGINT, UUID, TEXT, TEXT),
  handover_order(UUID, INT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  quote_order(UUID, JSONB, BIGINT),
  confirm_order(UUID, UUID, JSONB, BIGINT, JSONB, TEXT, TEXT),
  advance_work_item(UUID, INT, TEXT, TEXT, TEXT),
  create_payment_attempt(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT),
  confirm_payment_attempt(UUID, TEXT, TEXT),
  record_cash_receipt(UUID, BIGINT, BIGINT, UUID, TEXT, TEXT),
  handover_order(UUID, INT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)
TO authenticated;

-- ------------------------------------------------- fixture self-check ----
-- The same PRD §9.3 numbers the TypeScript side asserts in src/lib/domain/check.ts.
-- A migration that computes money differently from the UI must fail loudly here.
DO $$
BEGIN
  ASSERT calc_billable_grams(2350, 3000, 100) = 3000, 'PRD 9.3: minimum applies';
  ASSERT calc_line_gross('kg', 3000, 8000) = 24000, 'PRD 9.3: subtotal 24000';
  ASSERT calc_billable_grams(3210, 3000, 100) = 3300, 'PRD 9.3: rounds up to 3300 g';
  ASSERT calc_line_gross('kg', 3300, 8000) = 26400, 'PRD 9.3: subtotal 26400';
  ASSERT calc_line_gross('piece', 2, 35000) = 70000, 'per-item pricing';
END $$;
