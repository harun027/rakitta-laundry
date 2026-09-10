-- ========================================================================
-- 12 — Cash Session Read Model & Supervisor Review
-- PRD §9.5 (expected cash formula), §8.2 (a discrepancy is reviewed, never
-- absorbed), §10.1 (operators never see money).
-- Read-only companion to 05_cash_sessions_and_expenses.sql; no table changes.
-- ========================================================================

/**
 * Returns the outlet's single OPEN drawer session with everything the cashier
 * screen needs: the §9.5 components, the expense list, and the non-cash total
 * that must stay OUTSIDE the drawer.
 * Returns {"session": null} when the drawer has no open session.
 */
CREATE OR REPLACE FUNCTION get_active_cash_session(p_outlet UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_cs cash_sessions%ROWTYPE;
  v_receipts BIGINT := 0;
  v_refunds BIGINT := 0;
  v_expenses BIGINT := 0;
  v_other_in BIGINT := 0;
  v_other_out BIGINT := 0;
  v_non_cash BIGINT := 0;
  v_list JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant FROM outlets WHERE id = p_outlet;
  IF v_tenant IS NULL OR NOT app.has_outlet(p_outlet) THEN
    RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the money guard is repeated here.
  IF NOT app.can_see_money(v_tenant) THEN
    RAISE EXCEPTION 'money_forbidden' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO v_cs
  FROM cash_sessions
  WHERE outlet_id = p_outlet AND status = 'OPEN'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('session', NULL);
  END IF;

  -- Signed movements bucketed by origin so the UI can show the formula, not a
  -- single opaque net figure. Transfer/QRIS never lands in cash_movements.
  SELECT
    COALESCE(SUM(amount_signed_idr) FILTER (WHERE source_type = 'RECEIPT'), 0),
    COALESCE(-SUM(amount_signed_idr) FILTER (WHERE source_type = 'REFUND'), 0),
    COALESCE(-SUM(amount_signed_idr) FILTER (WHERE source_type = 'EXPENSE'), 0),
    COALESCE(SUM(amount_signed_idr) FILTER (
      WHERE source_type NOT IN ('RECEIPT', 'REFUND', 'EXPENSE') AND amount_signed_idr > 0), 0),
    COALESCE(-SUM(amount_signed_idr) FILTER (
      WHERE source_type NOT IN ('RECEIPT', 'REFUND', 'EXPENSE') AND amount_signed_idr < 0), 0)
  INTO v_receipts, v_refunds, v_expenses, v_other_in, v_other_out
  FROM cash_movements
  WHERE session_id = v_cs.id;

  -- Shown separately as "di luar laci": it is money received, not cash on hand.
  SELECT COALESCE(SUM(r.amount_idr), 0) INTO v_non_cash
  FROM receipts r
  JOIN orders o ON o.id = r.order_id
  WHERE o.outlet_id = p_outlet
    AND r.method <> 'CASH'
    AND r.confirmed_at >= v_cs.opened_at;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'created_at'), '[]'::jsonb) INTO v_list
  FROM (
    SELECT jsonb_build_object(
      'id', e.id,
      'category', e.category,
      'amount_idr', e.amount_idr,
      'notes', e.notes,
      'created_at', e.created_at,
      'actor_name', u.full_name
    ) AS item
    FROM expenses e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.session_id = v_cs.id
  ) s;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_cs.id,
      'outlet_id', v_cs.outlet_id,
      'status', v_cs.status,
      'opened_at', v_cs.opened_at,
      'opened_by_name', (SELECT full_name FROM users WHERE id = v_cs.opened_by),
      'opening_float_idr', v_cs.opening_float_idr,
      'notes', v_cs.notes
    ),
    'cash_receipts_idr', v_receipts,
    'cash_refunds_idr', v_refunds,
    'cash_expenses_idr', v_expenses,
    'other_cash_in_idr', v_other_in,
    'other_cash_out_idr', v_other_out,
    'expected_cash_idr', v_cs.opening_float_idr + v_receipts + v_other_in
                         - v_refunds - v_expenses - v_other_out,
    'non_cash_idr', v_non_cash,
    'expenses', v_list
  );
END;
$$;

/**
 * PRD §8.2 — a supervisor acknowledges a closing discrepancy. This only stamps
 * reviewed_by; the discrepancy itself is never written off or turned into an
 * expense, and the closing figures stay untouched.
 */
CREATE OR REPLACE FUNCTION review_cash_session(
  p_session UUID,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cs cash_sessions%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_cs FROM cash_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_cs.outlet_id) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF app.role_in(v_cs.tenant_id) NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'review_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF v_cs.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'session_not_closed' USING ERRCODE = 'PT422';
  END IF;

  -- Idempotent by nature: re-marking an already reviewed session is a no-op.
  UPDATE cash_sessions SET reviewed_by = app.user_id()
  WHERE id = p_session AND reviewed_by IS NULL;

  v_result := jsonb_build_object(
    'session_id', p_session,
    'reviewed_by', COALESCE(v_cs.reviewed_by, app.user_id()),
    'discrepancy_idr', v_cs.discrepancy_idr,
    'reviewed_at', NOW()
  );

  IF v_cs.reviewed_by IS NULL THEN
    PERFORM app.record(v_cs.tenant_id, v_cs.outlet_id, 'CASH_SESSION_REVIEWED', 'cash_sessions',
                       p_session, NULL, v_result, p_request_id, 'CashSessionReviewed', 1);
  END IF;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  get_active_cash_session(UUID),
  review_cash_session(UUID, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  get_active_cash_session(UUID),
  review_cash_session(UUID, TEXT)
TO authenticated;
