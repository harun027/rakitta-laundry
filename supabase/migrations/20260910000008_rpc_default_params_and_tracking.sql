-- ========================================================================
-- 08 — RPC parameter defaults and direct order_number tracking
-- ========================================================================

CREATE OR REPLACE FUNCTION record_cash_receipt(
  p_order UUID,
  p_applied_idr BIGINT,
  p_tendered_idr BIGINT,
  p_session UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
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
  IF p_tendered_idr < p_applied_idr THEN
    RAISE EXCEPTION 'tendered_less_than_applied' USING ERRCODE = 'PT400';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_o.tenant_id, 'record_cash_receipt', p_idempotency_key,
      jsonb_build_object('order', p_order, 'applied', p_applied_idr, 'tendered', p_tendered_idr));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  SELECT balance_idr INTO v_balance FROM v_order_ledger WHERE order_id = p_order;
  IF p_applied_idr > v_balance THEN
    RAISE EXCEPTION 'applied_exceeds_balance' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO receipts (
    tenant_id, order_id, amount_idr, method, confirmed_at, verifier_id,
    tendered_idr, change_idr, session_id
  ) VALUES (
    v_o.tenant_id, p_order, p_applied_idr, 'CASH', NOW(), app.user_id(),
    p_tendered_idr, p_tendered_idr - p_applied_idr, p_session
  ) RETURNING id INTO v_receipt;

  -- §12.2: update the cached balance on orders row.
  UPDATE orders
     SET paid_amount_idr = paid_amount_idr + p_applied_idr,
         balance_idr     = balance_idr - p_applied_idr,
         settlement_status = CASE
           WHEN balance_idr - p_applied_idr = 0 THEN 'SETTLED'
           ELSE 'PARTIAL' END,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_order;

  v_result := jsonb_build_object(
    'receipt_id', v_receipt,
    'applied_idr', p_applied_idr,
    'tendered_idr', p_tendered_idr,
    'change_idr', p_tendered_idr - p_applied_idr,
    'balance_idr', v_balance - p_applied_idr,
    'settlement_status', CASE WHEN v_balance - p_applied_idr = 0 THEN 'SETTLED' ELSE 'PARTIAL' END
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'CASH_RECEIPT_RECORDED', 'receipts',
                     v_receipt, NULL, v_result, p_request_id, 'CashReceiptRecorded', v_o.version + 1);
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_o.tenant_id, 'record_cash_receipt', p_idempotency_key, v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION handover_order(
  p_order UUID,
  p_expected_version INT,
  p_receiver TEXT,
  p_is_representative BOOLEAN DEFAULT FALSE,
  p_credit_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_role TEXT;
  v_balance BIGINT;
  v_replay JSONB;
  v_id UUID;
  v_result JSONB;
  v_credit_limit BIGINT := 100000;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF v_o.version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;
  IF v_o.custody_state = 'HANDED_OVER' THEN
    RAISE EXCEPTION 'already_handed_over' USING ERRCODE = 'PT422';
  END IF;

  v_role := app.role_in(v_o.tenant_id);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'handover_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF p_receiver IS NULL OR length(trim(p_receiver)) = 0 THEN
    RAISE EXCEPTION 'receiver_required' USING ERRCODE = 'PT400';
  END IF;

  IF EXISTS (SELECT 1 FROM work_items WHERE order_id = p_order AND stage <> 'READY') THEN
    RAISE EXCEPTION 'work_not_ready' USING ERRCODE = 'PT422';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_o.tenant_id, 'handover_order', p_idempotency_key,
      jsonb_build_object('order', p_order, 'receiver', p_receiver));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

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
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_o.tenant_id, 'handover_order', p_idempotency_key, v_result);
  END IF;
  RETURN v_result;
END;
$$;

-- Allow get_public_tracking to find order by token, token_hash, OR order_number
CREATE OR REPLACE FUNCTION get_public_tracking(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_outlet outlets%ROWTYPE;
  v_lines JSONB;
  v_work_items JSONB;
  v_balance BIGINT;
BEGIN
  -- 1. Look for order via tracking_tokens or direct order_number
  SELECT o.* INTO v_order
  FROM orders o
  WHERE o.order_number = trim(p_token)
     OR EXISTS (
       SELECT 1 FROM tracking_tokens tt
       WHERE tt.order_id = o.id AND (tt.token = trim(p_token) OR tt.token_hash = trim(p_token))
     )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found' USING ERRCODE = 'PT404';
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

GRANT EXECUTE ON FUNCTION
  record_cash_receipt(UUID, BIGINT, BIGINT, UUID, TEXT, TEXT),
  handover_order(UUID, INT, TEXT, BOOLEAN, TEXT, TEXT, TEXT)
TO authenticated;

GRANT EXECUTE ON FUNCTION get_public_tracking(TEXT) TO anon, authenticated;
