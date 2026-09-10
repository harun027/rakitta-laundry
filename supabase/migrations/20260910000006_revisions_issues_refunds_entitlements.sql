-- ========================================================================
-- 06 — Domain P0 Expansion: Revisions, Issues/Rework, Refunds, Follow-up & Entitlements
-- PRD: FR08 (Drafts), FR13 (Revisions), FR19-FR20 (Issues/Rework),
--      FR27 (Refunds/Reversals), FR34-FR35 (WhatsApp & Follow-up), FR37 (Entitlements)
-- ========================================================================

-- 1. ORDER REVISIONS (FR13)
CREATE TABLE IF NOT EXISTS order_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    revision_number INT NOT NULL,
    snapshot JSONB NOT NULL,
    delta_amount_idr BIGINT NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, revision_number)
);

-- 2. ISSUES & REWORK CASES (FR19, FR20)
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('STAIN', 'DAMAGE', 'MISSING_ITEM', 'CUSTOMER_COMPLAINT', 'EQUIPMENT_FAILURE', 'OTHER')),
    severity VARCHAR(20) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    is_blocking BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
    description TEXT NOT NULL,
    resolution_notes TEXT,
    reported_by UUID REFERENCES users(id),
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rework_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    case_number VARCHAR(100) NOT NULL,
    rework_type VARCHAR(50) NOT NULL CHECK (rework_type IN ('PRE_HANDOVER', 'POST_HANDOVER')),
    target_stage VARCHAR(50) NOT NULL,
    custody_state VARCHAR(50) DEFAULT 'RECEIVED' CHECK (custody_state IN ('REQUESTED', 'RECEIVED', 'IN_PROGRESS', 'READY', 'RETURNED', 'CANCELLED')),
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES users(id),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    UNIQUE(tenant_id, case_number)
);

-- 3. REFUNDS & REVERSALS (FR27)
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    method VARCHAR(50) NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'QRIS')),
    status VARCHAR(50) DEFAULT 'CONFIRMED' CHECK (status IN ('REQUESTED', 'APPROVED', 'CONFIRMED', 'REJECTED')),
    kind VARCHAR(50) DEFAULT 'REAL_REFUND' CHECK (kind IN ('REAL_REFUND', 'CORRECTION_REVERSAL')),
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES users(id),
    session_id UUID REFERENCES cash_sessions(id),
    confirmed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SUBSCRIPTION ENTITLEMENTS (FR37)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    plan VARCHAR(50) DEFAULT 'TRIAL' CHECK (plan IN ('TRIAL', 'ACTIVE', 'PRO', 'ENTERPRISE')),
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'GRACE_PERIOD', 'RESTRICTED', 'CANCELLED')),
    max_outlets INT DEFAULT 3,
    valid_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. WHATSAPP & NOTIFICATION LOGS (FR34, FR35)
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    recipient_phone VARCHAR(50) NOT NULL,
    channel VARCHAR(50) DEFAULT 'WHATSAPP_MANUAL',
    status VARCHAR(50) DEFAULT 'OPENED_IN_WHATSAPP' CHECK (status IN ('PREPARED', 'OPENED_IN_WHATSAPP', 'FAILED')),
    message_preview TEXT NOT NULL,
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- RPC 1: REVISI RESMI BERNOMOR (FR13)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION revise_order(
  p_order UUID,
  p_expected_version INT,
  p_new_lines JSONB,
  p_new_discount_idr BIGINT,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_role TEXT;
  v_replay JSONB;
  v_quote JSONB;
  v_rev_count INT;
  v_old_charges BIGINT;
  v_new_charges BIGINT;
  v_delta BIGINT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  v_role := app.role_in(v_o.tenant_id);
  IF v_role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'revision_forbidden_supervisor_required' USING ERRCODE = 'PT403';
  END IF;

  IF v_o.version <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'PT409';
  END IF;

  IF v_o.custody_state = 'HANDED_OVER' THEN
    RAISE EXCEPTION 'cannot_revise_handed_over_order' USING ERRCODE = 'PT422';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'revision_reason_required' USING ERRCODE = 'PT400';
  END IF;

  v_replay := app.claim_idempotency(v_o.tenant_id, 'revise_order', p_idempotency_key,
    jsonb_build_object('order', p_order, 'lines', p_new_lines, 'discount', p_new_discount_idr));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Re-quote server side
  v_quote := quote_order(v_o.outlet_id, p_new_lines, p_new_discount_idr);
  v_old_charges := v_o.total_charges_idr;
  v_new_charges := (v_quote->>'total_charges_idr')::bigint;
  v_delta := v_new_charges - v_old_charges;

  SELECT COUNT(*) + 1 INTO v_rev_count FROM order_revisions WHERE order_id = p_order;

  -- Record Revision
  INSERT INTO order_revisions (
    tenant_id, order_id, revision_number, snapshot, delta_amount_idr, reason, approved_by
  ) VALUES (
    v_o.tenant_id, p_order, v_rev_count, v_quote, v_delta, trim(p_reason), app.user_id()
  );

  -- Adjust Charge Entries
  IF v_delta > 0 THEN
    INSERT INTO charge_entries (tenant_id, order_id, kind, amount_idr, actor_id, reason)
    VALUES (v_o.tenant_id, p_order, 'DEBIT_ADJUSTMENT', v_delta, app.user_id(), 'Revisi #' || v_rev_count || ': ' || trim(p_reason));
  ELSIF v_delta < 0 THEN
    INSERT INTO charge_entries (tenant_id, order_id, kind, amount_idr, actor_id, reason)
    VALUES (v_o.tenant_id, p_order, 'CREDIT_ADJUSTMENT', -v_delta, app.user_id(), 'Revisi #' || v_rev_count || ': ' || trim(p_reason));
  END IF;

  UPDATE orders SET
    version = version + 1,
    current_promised_at = (v_quote->>'suggested_due_at')::timestamptz,
    updated_at = NOW()
  WHERE id = p_order;

  v_result := jsonb_build_object(
    'order_id', p_order,
    'revision_number', v_rev_count,
    'version', v_o.version + 1,
    'delta_idr', v_delta,
    'new_total_charges_idr', v_new_charges,
    'ledger', app.refresh_order_ledger(p_order)
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'ORDER_REVISED', 'orders', p_order,
                     jsonb_build_object('old_charges', v_old_charges), v_result,
                     p_request_id, 'OrderRevised', v_o.version + 1);

  PERFORM app.finish_idempotency(v_o.tenant_id, 'revise_order', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- RPC 2: LAPOR & ATASI ISU / BLOKIR (FR19)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION report_order_issue(
  p_order UUID,
  p_category TEXT,
  p_severity TEXT,
  p_description TEXT,
  p_is_blocking BOOLEAN DEFAULT TRUE,
  p_work_item UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_issue_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'description_required' USING ERRCODE = 'PT400';
  END IF;

  INSERT INTO issues (
    tenant_id, order_id, work_item_id, category, severity, is_blocking, description, reported_by
  ) VALUES (
    v_o.tenant_id, p_order, p_work_item, p_category, COALESCE(p_severity, 'MEDIUM'),
    COALESCE(p_is_blocking, TRUE), trim(p_description), app.user_id()
  ) RETURNING id INTO v_issue_id;

  v_result := jsonb_build_object(
    'issue_id', v_issue_id,
    'order_id', p_order,
    'is_blocking', COALESCE(p_is_blocking, TRUE),
    'status', 'OPEN'
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'ISSUE_REPORTED', 'issues', v_issue_id,
                     NULL, v_result, NULL);

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_order_issue(
  p_issue UUID,
  p_resolution TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_iss issues%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_iss FROM issues WHERE id = p_issue FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF p_resolution IS NULL OR length(trim(p_resolution)) = 0 THEN
    RAISE EXCEPTION 'resolution_required' USING ERRCODE = 'PT400';
  END IF;

  UPDATE issues SET
    status = 'RESOLVED',
    resolution_notes = trim(p_resolution),
    resolved_by = app.user_id(),
    resolved_at = NOW()
  WHERE id = p_issue;

  v_result := jsonb_build_object('issue_id', p_issue, 'status', 'RESOLVED');

  PERFORM app.record(v_iss.tenant_id, NULL, 'ISSUE_RESOLVED', 'issues', p_issue,
                     jsonb_build_object('status', 'OPEN'), v_result, NULL);

  RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- RPC 3: PROSES REWORK (FR20)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION initiate_rework(
  p_order UUID,
  p_target_stage TEXT,
  p_reason TEXT,
  p_is_post_handover BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_case_id UUID;
  v_case_no TEXT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF app.role_in(v_o.tenant_id) NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'rework_supervisor_required' USING ERRCODE = 'PT403';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'rework_reason_required' USING ERRCODE = 'PT400';
  END IF;

  v_case_no := 'RW-' || v_o.order_number || '-' || (FLOOR(RANDOM() * 900 + 100))::text;

  IF NOT p_is_post_handover THEN
    -- Pre-handover: rollback stage & void current ready packages
    UPDATE work_items SET
      stage = p_target_stage,
      version = version + 1,
      cycle = cycle + 1,
      updated_at = NOW()
    WHERE order_id = p_order;

    -- Invalidate ready packages for repacking
    DELETE FROM final_packages WHERE order_id = p_order;

    INSERT INTO rework_cases (
      tenant_id, order_id, case_number, rework_type, target_stage, custody_state, reason, approved_by
    ) VALUES (
      v_o.tenant_id, p_order, v_case_no, 'PRE_HANDOVER', p_target_stage, 'IN_PROGRESS', trim(p_reason), app.user_id()
    ) RETURNING id INTO v_case_id;
  ELSE
    -- Post-handover rework case
    INSERT INTO rework_cases (
      tenant_id, order_id, case_number, rework_type, target_stage, custody_state, reason, approved_by
    ) VALUES (
      v_o.tenant_id, p_order, v_case_no, 'POST_HANDOVER', p_target_stage, 'RECEIVED', trim(p_reason), app.user_id()
    ) RETURNING id INTO v_case_id;
  END IF;

  v_result := jsonb_build_object(
    'rework_case_id', v_case_id,
    'case_number', v_case_no,
    'target_stage', p_target_stage,
    'order_id', p_order
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'REWORK_INITIATED', 'rework_cases', v_case_id,
                     NULL, v_result, NULL);

  RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- RPC 4: REFUND & REVERSAL KAS/BANK (FR27)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_refund(
  p_receipt UUID,
  p_amount_idr BIGINT,
  p_reason TEXT,
  p_kind TEXT DEFAULT 'REAL_REFUND', -- 'REAL_REFUND' or 'CORRECTION_REVERSAL'
  p_session UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec receipts%ROWTYPE;
  v_o orders%ROWTYPE;
  v_refunded_so_far BIGINT;
  v_available BIGINT;
  v_ref_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_rec FROM receipts WHERE id = p_receipt FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt_not_found' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_o FROM orders WHERE id = v_rec.order_id FOR UPDATE;
  IF NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'receipt_not_found' USING ERRCODE = 'PT404';
  END IF;

  IF app.role_in(v_o.tenant_id) NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'refund_supervisor_required' USING ERRCODE = 'PT403';
  END IF;

  IF p_amount_idr IS NULL OR p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = 'PT400';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'PT400';
  END IF;

  -- Check max refundable amount from this source receipt
  SELECT COALESCE(SUM(amount_idr), 0) INTO v_refunded_so_far
  FROM refunds WHERE receipt_id = p_receipt AND status = 'CONFIRMED';

  v_available := v_rec.amount_idr - v_refunded_so_far;
  IF p_amount_idr > v_available THEN
    RAISE EXCEPTION 'refund_amount_exceeds_available_receipt_balance' USING ERRCODE = 'PT422';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_result := app.claim_idempotency(v_o.tenant_id, 'process_refund', p_idempotency_key,
      jsonb_build_object('receipt', p_receipt, 'amount', p_amount_idr, 'kind', p_kind));
    IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  END IF;

  -- If cash real refund, deduct from active session
  IF v_rec.method = 'CASH' AND p_kind = 'REAL_REFUND' THEN
    IF p_session IS NULL OR NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = p_session AND outlet_id = v_o.outlet_id AND status = 'OPEN') THEN
      RAISE EXCEPTION 'open_cash_session_required_for_cash_refund' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  INSERT INTO refunds (
    tenant_id, order_id, receipt_id, amount_idr, method, status, kind, reason, approved_by, session_id
  ) VALUES (
    v_o.tenant_id, v_o.id, p_receipt, p_amount_idr, v_rec.method, 'CONFIRMED', COALESCE(p_kind, 'REAL_REFUND'),
    trim(p_reason), app.user_id(), p_session
  ) RETURNING id INTO v_ref_id;

  IF v_rec.method = 'CASH' AND p_kind = 'REAL_REFUND' AND p_session IS NOT NULL THEN
    INSERT INTO cash_movements (tenant_id, session_id, source_type, source_id, amount_signed_idr)
    VALUES (v_o.tenant_id, p_session, 'REFUND', v_ref_id, -p_amount_idr);
  END IF;

  v_result := jsonb_build_object(
    'refund_id', v_ref_id,
    'receipt_id', p_receipt,
    'amount_idr', p_amount_idr,
    'kind', p_kind,
    'ledger', app.refresh_order_ledger(v_o.id)
  );

  PERFORM app.record(v_o.tenant_id, v_o.outlet_id, 'REFUND_CONFIRMED', 'refunds', v_ref_id,
                     NULL, v_result, p_request_id, 'RefundConfirmed', 1);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM app.finish_idempotency(v_o.tenant_id, 'process_refund', p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- RPC 5: LOG MANUAL WHATSAPP / NOTIFIKASI (FR34, FR35)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_manual_notification(
  p_order UUID,
  p_recipient_phone TEXT,
  p_message_preview TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o orders%ROWTYPE;
  v_log_id UUID;
BEGIN
  SELECT * INTO v_o FROM orders WHERE id = p_order;
  IF NOT FOUND OR NOT app.has_outlet(v_o.outlet_id) THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'PT404';
  END IF;

  INSERT INTO notification_logs (
    tenant_id, order_id, recipient_phone, channel, status, message_preview, actor_id
  ) VALUES (
    v_o.tenant_id, p_order, trim(p_recipient_phone), 'WHATSAPP_MANUAL', 'OPENED_IN_WHATSAPP',
    trim(p_message_preview), app.user_id()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('log_id', v_log_id, 'status', 'OPENED_IN_WHATSAPP');
END;
$$;

-- ------------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  revise_order(UUID, INT, JSONB, BIGINT, TEXT, TEXT, TEXT),
  report_order_issue(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID),
  resolve_order_issue(UUID, TEXT),
  initiate_rework(UUID, TEXT, TEXT, BOOLEAN),
  process_refund(UUID, BIGINT, TEXT, TEXT, UUID, TEXT, TEXT),
  log_manual_notification(UUID, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  revise_order(UUID, INT, JSONB, BIGINT, TEXT, TEXT, TEXT),
  report_order_issue(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID),
  resolve_order_issue(UUID, TEXT),
  initiate_rework(UUID, TEXT, TEXT, BOOLEAN),
  process_refund(UUID, BIGINT, TEXT, TEXT, UUID, TEXT, TEXT),
  log_manual_notification(UUID, TEXT, TEXT)
TO authenticated;
