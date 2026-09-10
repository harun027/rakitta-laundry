-- ========================================================================
-- 06 — Tracking tokens column and token hash support
-- ========================================================================

ALTER TABLE tracking_tokens ADD COLUMN IF NOT EXISTS token VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_token ON tracking_tokens (token);

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
  SELECT * INTO v_token_row FROM tracking_tokens 
  WHERE (token = trim(p_token) OR token_hash = trim(p_token))
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
