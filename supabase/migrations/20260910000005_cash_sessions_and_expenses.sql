-- ========================================================================
-- 05 — Cash Sessions & Expenses Atomic Commands
-- PRD §9.5 Cash sessions formula, §7.4 FR28/FR29, §13.1 POST /cash-sessions/:id/close
-- ========================================================================

/**
 * Opens a new cash drawer session.
 * PRD §9.5 & §12.1: Exactly one active (OPEN) session per drawer / outlet.
 */
CREATE OR REPLACE FUNCTION open_cash_session(
  p_outlet UUID,
  p_opening_float BIGINT DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_replay JSONB;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL OR NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  v_role := app.role_in(v_tenant);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'cash_forbidden' USING ERRCODE = 'PT403';
  END IF;

  -- Guard: Only one open session allowed per outlet drawer
  IF EXISTS (SELECT 1 FROM cash_sessions WHERE outlet_id = p_outlet AND status = 'OPEN') THEN
    RAISE EXCEPTION 'active_session_already_exists' USING ERRCODE = 'PT422';
  END IF;

  IF p_opening_float < 0 THEN
    RAISE EXCEPTION 'float_cannot_be_negative' USING ERRCODE = 'PT400';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_tenant, 'open_cash_session', p_idempotency_key,
      jsonb_build_object('outlet', p_outlet, 'float', p_opening_float));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  INSERT INTO cash_sessions (
    tenant_id, outlet_id, opened_by, opening_float_idr,
    expected_cash_idr, status, notes
  ) VALUES (
    v_tenant, p_outlet, app.user_id(), p_opening_float,
    p_opening_float, 'OPEN', p_notes
  ) RETURNING id INTO v_session_id;

  v_result := jsonb_build_object(
    'session_id', v_session_id,
    'outlet_id', p_outlet,
    'opening_float_idr', p_opening_float,
    'status', 'OPEN',
    'opened_at', NOW()
  );

  PERFORM app.record(v_tenant, p_outlet, 'CASH_SESSION_OPENED', 'cash_sessions',
                     v_session_id, NULL, v_result, p_request_id, 'CashSessionOpened', 1);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_tenant, 'open_cash_session', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

/**
 * Closes an active cash session with atomic reconciliation.
 * PRD §9.5 Formula: expected = float + cash_receipts + cash_in - cash_refunds - cash_expenses - cash_out
 * discrepancy = actual_cash - expected_cash
 */
CREATE OR REPLACE FUNCTION close_cash_session(
  p_session UUID,
  p_actual_cash BIGINT,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cs cash_sessions%ROWTYPE;
  v_role TEXT;
  v_replay JSONB;
  v_cash_in BIGINT := 0;
  v_cash_out BIGINT := 0;
  v_expected BIGINT;
  v_discrepancy BIGINT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_cs FROM cash_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_cs.outlet_id) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_role := app.role_in(v_cs.tenant_id);
  -- Cashier can close own session; SPV / Owner can close any session in outlet
  IF v_role NOT IN ('owner', 'supervisor') AND v_cs.opened_by <> app.user_id() THEN
    RAISE EXCEPTION 'close_session_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF v_cs.status <> 'OPEN' THEN
    RAISE EXCEPTION 'session_already_closed' USING ERRCODE = 'PT422';
  END IF;

  IF p_actual_cash IS NULL OR p_actual_cash < 0 THEN
    RAISE EXCEPTION 'actual_cash_invalid' USING ERRCODE = 'PT400';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_cs.tenant_id, 'close_cash_session', p_idempotency_key,
      jsonb_build_object('session', p_session, 'actual', p_actual_cash));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  -- Calculate total cash movements
  SELECT 
    COALESCE(SUM(CASE WHEN amount_signed_idr > 0 THEN amount_signed_idr ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN amount_signed_idr < 0 THEN -amount_signed_idr ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE session_id = p_session;

  -- PRD §9.5 deterministic expected cash
  v_expected := v_cs.opening_float_idr + v_cash_in - v_cash_out;
  v_discrepancy := p_actual_cash - v_expected;

  UPDATE cash_sessions SET
    closed_at = NOW(),
    expected_cash_idr = v_expected,
    actual_cash_idr = p_actual_cash,
    discrepancy_idr = v_discrepancy,
    status = 'CLOSED',
    notes = COALESCE(p_notes, notes)
  WHERE id = p_session;

  v_result := jsonb_build_object(
    'session_id', p_session,
    'status', 'CLOSED',
    'opening_float_idr', v_cs.opening_float_idr,
    'cash_in_idr', v_cash_in,
    'cash_out_idr', v_cash_out,
    'expected_cash_idr', v_expected,
    'actual_cash_idr', p_actual_cash,
    'discrepancy_idr', v_discrepancy,
    'closed_at', NOW()
  );

  PERFORM app.record(v_cs.tenant_id, v_cs.outlet_id, 'CASH_SESSION_CLOSED', 'cash_sessions',
                     p_session, jsonb_build_object('status', 'OPEN'), v_result,
                     p_request_id, 'CashSessionClosed', 1);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_cs.tenant_id, 'close_cash_session', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

/**
 * Records an operational cash expense with immediate session deduction.
 * PRD §7.4 FR29: Expense amount, category, notes, and session cash_movement.
 */
CREATE OR REPLACE FUNCTION record_cash_expense(
  p_outlet UUID,
  p_session UUID,
  p_category TEXT,
  p_amount_idr BIGINT,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_role TEXT;
  v_replay JSONB;
  v_exp_id UUID;
  v_result JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL OR NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  v_role := app.role_in(v_tenant);
  IF v_role NOT IN ('owner', 'supervisor', 'cashier') THEN
    RAISE EXCEPTION 'expense_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF p_amount_idr IS NULL OR p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = 'PT400';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = p_session AND outlet_id = p_outlet AND status = 'OPEN') THEN
    RAISE EXCEPTION 'open_cash_session_required' USING ERRCODE = 'PT422';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := app.claim_idempotency(v_tenant, 'record_cash_expense', p_idempotency_key,
      jsonb_build_object('session', p_session, 'amount', p_amount_idr, 'category', p_category));
    IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  END IF;

  INSERT INTO expenses (
    tenant_id, outlet_id, session_id, category, amount_idr, method, notes, actor_id
  ) VALUES (
    v_tenant, p_outlet, p_session, trim(p_category), p_amount_idr, 'CASH', p_notes, app.user_id()
  ) RETURNING id INTO v_exp_id;

  -- Create negative cash movement to reduce expected cash
  INSERT INTO cash_movements (
    tenant_id, session_id, source_type, source_id, amount_signed_idr
  ) VALUES (
    v_tenant, p_session, 'EXPENSE', v_exp_id, -p_amount_idr
  );

  v_result := jsonb_build_object(
    'expense_id', v_exp_id,
    'session_id', p_session,
    'amount_idr', p_amount_idr,
    'category', trim(p_category),
    'created_at', NOW()
  );

  PERFORM app.record(v_tenant, p_outlet, 'EXPENSE_RECORDED', 'expenses',
                     v_exp_id, NULL, v_result, p_request_id, 'ExpenseRecorded', 1);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_tenant, 'record_cash_expense', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  open_cash_session(UUID, BIGINT, TEXT, TEXT, TEXT),
  close_cash_session(UUID, BIGINT, TEXT, TEXT, TEXT),
  record_cash_expense(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  open_cash_session(UUID, BIGINT, TEXT, TEXT, TEXT),
  close_cash_session(UUID, BIGINT, TEXT, TEXT, TEXT),
  record_cash_expense(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT)
TO authenticated;
