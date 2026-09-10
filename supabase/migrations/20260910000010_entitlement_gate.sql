-- ========================================================================
-- 10 — Entitlement gate (FR37) and order cancellation (FR23)
--
-- FR37 / §19.2: after the grace period the subscription only blocks NEW orders.
-- Completion, payments, refunds, reports, exports, rework and custody returns
-- on existing orders stay available (§5.7) so unpaid app billing never holds a
-- customer's laundry hostage. The gate therefore lives in confirm_order alone.
--
-- FR23 / §5.6 / §6.2 "Cancel": service cancellation, money refund and physical
-- return are three separate actions. Cancelling writes a lifecycle change, an
-- explained credit adjustment when the bill is waived, and a custody flag only
-- when the goods really went back. It deletes nothing and refunds nothing.
--
-- Error contract (§13.1): PT400 validation · PT403 permission · PT404 not found
--                         PT409 version/idempotency conflict · PT422 bad state
-- ========================================================================

-- ================ COMMAND: confirm order (+ FR37 entitlement) =============
-- Unchanged from migration 03 except for the subscription gate below.
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

  -- FR37 / §19.2 — a RESTRICTED subscription blocks NEW orders only. Finishing,
  -- paying, refunding, reporting, exporting, rework and custody returns on
  -- existing orders stay open (§5.7), so app billing never strands the customer's
  -- goods. Checked before the idempotency claim: a blocked attempt must leave no
  -- half-claimed key behind. A tenant with no subscription row is not restricted.
  IF EXISTS (SELECT 1 FROM subscriptions WHERE tenant_id = v_tenant AND status = 'RESTRICTED') THEN
    RAISE EXCEPTION 'subscription_restricted' USING ERRCODE = 'PT422';
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

-- ======================= COMMAND: cancel order ============================
-- §6.2 "Cancel": permission + approved settlement → lifecycle + credit
-- adjustment + custody flags; rejected once the order was handed over.
-- p_settlement: { "waive_idr": BIGINT, "goods_returned": BOOLEAN, "receiver": TEXT }
CREATE OR REPLACE FUNCTION cancel_order(
  p_order UUID,
  p_expected_version INT,
  p_settlement JSONB,        -- {waive_idr, goods_returned, receiver} or NULL
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_role TEXT;
  v_replay JSONB;
  v_balance BIGINT;
  v_waive BIGINT;
  v_returned BOOLEAN;
  v_receiver TEXT;
  v_custody TEXT;
  v_cancelled INT;
  v_ledger JSONB;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  -- §5.6 — once processing has started, only a supervisor or owner may cancel.
  v_role := app.role_in(v_o.tenant_id);
  IF v_role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'cancel_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF v_o.version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  -- §6.2 — a handed-over order is history; complaints and rework handle it.
  IF v_o.custody_state = 'HANDED_OVER' THEN
    RAISE EXCEPTION 'cancel_after_handover' USING ERRCODE = 'PT422';
  END IF;
  IF v_o.lifecycle = 'CANCELLED' THEN
    RAISE EXCEPTION 'already_cancelled' USING ERRCODE = 'PT422';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'cancel_reason_required' USING ERRCODE = 'PT400';
  END IF;

  v_returned := COALESCE((p_settlement->>'goods_returned')::boolean, FALSE);
  v_receiver := NULLIF(trim(COALESCE(p_settlement->>'receiver', '')), '');
  -- §5.7 — the lifecycle alone may not mark goods returned; someone signed for them.
  IF v_returned AND v_receiver IS NULL THEN
    RAISE EXCEPTION 'receiver_required' USING ERRCODE = 'PT400';
  END IF;

  v_replay := app.claim_idempotency(v_o.tenant_id, 'cancel_order', p_idempotency_key,
    jsonb_build_object('order', p_order, 'settlement', p_settlement, 'reason', p_reason));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- §5.6 — cancelling never refunds. Money already received stays received; only
  -- the part still outstanding can be waived, and only as an explained credit.
  SELECT balance_idr INTO v_balance FROM v_order_ledger WHERE order_id = p_order;
  v_waive := LEAST(GREATEST(COALESCE((p_settlement->>'waive_idr')::bigint, 0), 0),
                   GREATEST(COALESCE(v_balance, 0), 0));

  IF v_waive > 0 THEN
    INSERT INTO charge_entries (tenant_id, order_id, kind, amount_idr, actor_id, reason)
    VALUES (v_o.tenant_id, p_order, 'CREDIT_ADJUSTMENT', v_waive, app.user_id(),
            'Pembatalan order: ' || trim(p_reason));
  END IF;

  -- §6.1 — work that never finished is cancelled with a reasoned event; work
  -- already READY keeps its history.
  INSERT INTO work_events (tenant_id, work_item_id, from_stage, to_stage, actor_id, reason)
  SELECT v_o.tenant_id, id, stage, 'CANCELLED', app.user_id(), trim(p_reason)
    FROM work_items
   WHERE order_id = p_order AND stage NOT IN ('READY', 'CANCELLED');

  UPDATE work_items
     SET stage = 'CANCELLED', version = version + 1, updated_at = NOW()
   WHERE order_id = p_order AND stage NOT IN ('READY', 'CANCELLED');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- §5.7 — custody changes only when the goods physically went back.
  v_custody := CASE WHEN v_returned THEN 'RETURNED_ON_CANCEL' ELSE v_o.custody_state END;

  UPDATE orders
     SET lifecycle = 'CANCELLED', custody_state = v_custody,
         version = version + 1, updated_at = NOW()
   WHERE id = p_order AND version = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  IF v_returned THEN
    UPDATE final_packages SET custody_state = 'RETURNED'
     WHERE order_id = p_order AND custody_state = 'IN_CUSTODY';
  END IF;

  v_ledger := app.refresh_order_ledger(p_order);

  v_result := jsonb_build_object(
    'order_id', p_order,
    'version', v_o.version + 1,
    'lifecycle', 'CANCELLED',
    'custody_state', v_custody,
    'goods_returned', v_returned,
    'receiver_name', v_receiver,
    'waived_idr', v_waive,
    'cancelled_work_items', v_cancelled,
    'reason', trim(p_reason),
    'ledger', v_ledger
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'ORDER_CANCELLED', 'orders', p_order,
                     jsonb_build_object('lifecycle', v_o.lifecycle,
                                        'custody_state', v_o.custody_state,
                                        'balance_idr', v_balance),
                     v_result, p_request_id, 'OrderCancelled', v_o.version + 1);
  PERFORM app.finish_idempotency(v_o.tenant_id, 'cancel_order', p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  confirm_order(UUID, UUID, JSONB, BIGINT, JSONB, TEXT, TEXT),
  cancel_order(UUID, INT, JSONB, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  confirm_order(UUID, UUID, JSONB, BIGINT, JSONB, TEXT, TEXT),
  cancel_order(UUID, INT, JSONB, TEXT, TEXT, TEXT)
TO authenticated;
