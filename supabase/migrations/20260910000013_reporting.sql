-- ========================================================================
-- 13 — Reporting sources (FR30), export audit (FR31/FR36), owner overview
-- PRD §8.1 "Overview", §9.5 closing note, §10.1 reports/exports/audit RBAC
--
-- Design decisions encoded here:
--   * SECURITY DEFINER with its own permission check, like every other
--     command (§11.4: RLS protects rows, not business actions).
--   * report_rows() is the ONE source for both drill-down and CSV export, so
--     "drill-down sums equal summaries" (FR30) is true by construction rather
--     than by two queries that happen to agree today.
--   * Order value, money received, refunds, receivables and expenses stay in
--     separate sections. §9.5: these are different measures — the report must
--     not add them into a single "profit" number.
--   * Receivables are computed AS OF the interval end, mirroring
--     v_order_ledger's formula, so a historical cutoff does not silently
--     report today's balance.
--
-- Error contract (§13.1) — codes the reports route maps to the envelope:
--   report_forbidden — role has no reports/exports/audit access
--   outlet_forbidden — role is fine but this outlet is not theirs
-- ========================================================================

-- --------------------------------------------------------------- guard ---
-- §10.1: reports/exports/audit = owner (every outlet) and supervisor
-- (authorized outlets). Cashier gets its own session summary elsewhere;
-- operator has no financial access at all.
CREATE OR REPLACE FUNCTION app.report_guard(p_tenant UUID, p_outlet UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tenant IS NULL OR COALESCE(app.role_in(p_tenant), '') NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'report_forbidden' USING ERRCODE = 'PT403';
  END IF;

  IF p_outlet IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet AND tenant_id = p_tenant) THEN
      RAISE EXCEPTION 'outlet_not_found' USING ERRCODE = 'PT404';
    END IF;
    IF NOT app.has_outlet(p_outlet) THEN
      RAISE EXCEPTION 'outlet_forbidden' USING ERRCODE = 'PT403';
    END IF;
  END IF;
END;
$$;

-- ==================== FR30: drill-down rows (source of truth) =============
-- One row per underlying record. Amounts are always positive magnitudes; the
-- section carries the direction, because §9.5 forbids netting these into one
-- figure. p_outlet NULL means "every outlet of this tenant the caller may see".
CREATE OR REPLACE FUNCTION report_rows(
  p_tenant UUID,
  p_outlet UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  section       TEXT,
  occurred_at   TIMESTAMPTZ,
  outlet_name   TEXT,
  order_number  TEXT,
  customer_name TEXT,
  detail        TEXT,
  method        TEXT,
  amount_idr    BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to   TIMESTAMPTZ;
BEGIN
  PERFORM app.report_guard(p_tenant, p_outlet);

  v_to   := COALESCE(p_to, now());
  v_from := COALESCE(p_from, v_to - INTERVAL '1 day');
  IF v_from >= v_to THEN
    RAISE EXCEPTION 'invalid_interval' USING ERRCODE = 'PT400';
  END IF;

  RETURN QUERY
  -- Order value: net charges of orders accepted inside the interval. This is
  -- what was sold, not what was collected.
  SELECT
    'ORDER_VALUE'::TEXT,
    o.accepted_at,
    ol.name::TEXT,
    o.order_number::TEXT,
    c.name::TEXT,
    'Nilai order (biaya bersih setelah revisi)'::TEXT,
    NULL::TEXT,
    l.net_charges_idr
  FROM orders o
  JOIN outlets   ol ON ol.id = o.outlet_id
  JOIN customers c  ON c.id  = o.customer_id
  JOIN v_order_ledger l ON l.order_id = o.id
  WHERE o.tenant_id = p_tenant
    AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
    AND app.has_outlet(o.outlet_id)
    AND o.lifecycle = 'ACTIVE'
    AND o.accepted_at >= v_from AND o.accepted_at < v_to

  UNION ALL
  -- Money actually received, per confirmed receipt, with its method.
  SELECT
    'RECEIPT'::TEXT,
    r.confirmed_at,
    ol.name::TEXT,
    o.order_number::TEXT,
    c.name::TEXT,
    COALESCE('Ref ' || r.reference, 'Penerimaan pembayaran')::TEXT,
    r.method::TEXT,
    r.amount_idr
  FROM receipts r
  JOIN orders    o  ON o.id  = r.order_id
  JOIN outlets   ol ON ol.id = o.outlet_id
  JOIN customers c  ON c.id  = o.customer_id
  WHERE r.tenant_id = p_tenant
    AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
    AND app.has_outlet(o.outlet_id)
    AND r.confirmed_at >= v_from AND r.confirmed_at < v_to

  UNION ALL
  -- Refunds paid out. Never folded into receipts (§9.5).
  SELECT
    'REFUND'::TEXT,
    f.confirmed_at,
    ol.name::TEXT,
    o.order_number::TEXT,
    c.name::TEXT,
    (CASE f.kind WHEN 'CORRECTION_REVERSAL' THEN 'Koreksi: ' ELSE 'Refund: ' END || f.reason)::TEXT,
    f.method::TEXT,
    f.amount_idr
  FROM refunds f
  JOIN orders    o  ON o.id  = f.order_id
  JOIN outlets   ol ON ol.id = o.outlet_id
  JOIN customers c  ON c.id  = o.customer_id
  WHERE f.tenant_id = p_tenant
    AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
    AND app.has_outlet(o.outlet_id)
    AND f.status = 'CONFIRMED'
    AND f.confirmed_at >= v_from AND f.confirmed_at < v_to

  UNION ALL
  -- Petty-cash expenses. Operational spend, not an accounting cost of sales.
  SELECT
    'EXPENSE'::TEXT,
    e.created_at,
    ol.name::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    (e.category || COALESCE(' — ' || e.notes, ''))::TEXT,
    e.method::TEXT,
    e.amount_idr
  FROM expenses e
  JOIN outlets ol ON ol.id = e.outlet_id
  WHERE e.tenant_id = p_tenant
    AND (p_outlet IS NULL OR e.outlet_id = p_outlet)
    AND app.has_outlet(e.outlet_id)
    AND e.created_at >= v_from AND e.created_at < v_to

  UNION ALL
  -- Receivables outstanding AS OF the end of the interval. Mirrors
  -- v_order_ledger.balance_idr but with every component cut off at v_to, so a
  -- report for last week does not show this week's payments.
  SELECT
    'RECEIVABLE'::TEXT,
    o.accepted_at,
    ol.name::TEXT,
    o.order_number::TEXT,
    c.name::TEXT,
    ('Sisa tagihan per akhir interval · ' || o.settlement_status)::TEXT,
    NULL::TEXT,
    b.balance_idr
  FROM orders o
  JOIN outlets   ol ON ol.id = o.outlet_id
  JOIN customers c  ON c.id  = o.customer_id
  CROSS JOIN LATERAL (
    SELECT GREATEST(0, COALESCE((
             SELECT SUM(CASE WHEN ce.kind = 'CREDIT_ADJUSTMENT' THEN -ce.amount_idr ELSE ce.amount_idr END)
             FROM charge_entries ce WHERE ce.order_id = o.id AND ce.created_at < v_to), 0))
           - (COALESCE((SELECT SUM(r.amount_idr) FROM receipts r
                        WHERE r.order_id = o.id AND r.confirmed_at < v_to), 0)
              - COALESCE((SELECT SUM(f.amount_idr) FROM refunds f
                          WHERE f.order_id = o.id AND f.status = 'CONFIRMED' AND f.confirmed_at < v_to), 0))
           AS balance_idr
  ) b
  WHERE o.tenant_id = p_tenant
    AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
    AND app.has_outlet(o.outlet_id)
    AND o.lifecycle = 'ACTIVE'
    AND o.accepted_at < v_to
    AND b.balance_idr > 0

  ORDER BY 1, 2 DESC;
END;
$$;

-- ==================== FR30: summary + drill-down in one payload ===========
-- Totals are aggregated from report_rows(), never from a parallel query, so
-- the summary and the drill-down cannot drift apart.
CREATE OR REPLACE FUNCTION report_financial(
  p_tenant UUID,
  p_outlet UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_row_limit INT DEFAULT 500
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from  TIMESTAMPTZ;
  v_to    TIMESTAMPTZ;
  v_label TEXT;
  v_tz    TEXT;
  v_total INT;
  v_limit INT := LEAST(GREATEST(COALESCE(p_row_limit, 500), 1), 2000);
BEGIN
  PERFORM app.report_guard(p_tenant, p_outlet);

  v_to   := COALESCE(p_to, now());
  v_from := COALESCE(p_from, v_to - INTERVAL '1 day');

  SELECT string_agg(x.name, ', ' ORDER BY x.name),
         CASE WHEN COUNT(DISTINCT x.timezone) = 1 THEN MIN(x.timezone) ELSE 'MIXED' END
    INTO v_label, v_tz
  FROM (
    SELECT name::TEXT AS name, timezone::TEXT AS timezone
    FROM outlets
    WHERE tenant_id = p_tenant AND (p_outlet IS NULL OR id = p_outlet) AND app.has_outlet(id)
  ) x;

  SELECT COUNT(*) INTO v_total FROM report_rows(p_tenant, p_outlet, v_from, v_to);

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'outlet_id', p_outlet,
      'outlet_label', COALESCE(v_label, '—'),
      'timezone', COALESCE(v_tz, 'Asia/Jakarta'),
      'generated_at', now(),
      'row_count', v_total,
      'truncated', v_total > v_limit
    ),
    -- §9.5: five separate measures. No net "profit" line is produced here.
    'totals', (
      SELECT jsonb_object_agg(s.section, jsonb_build_object(
               'total_idr', COALESCE(t.total, 0)::BIGINT,
               'count', COALESCE(t.cnt, 0)::INT))
      FROM (VALUES ('ORDER_VALUE'), ('RECEIPT'), ('REFUND'), ('EXPENSE'), ('RECEIVABLE')) AS s(section)
      LEFT JOIN (
        SELECT r.section AS section, SUM(r.amount_idr) AS total, COUNT(*) AS cnt
        FROM report_rows(p_tenant, p_outlet, v_from, v_to) r
        GROUP BY r.section
      ) t ON t.section = s.section
    ),
    'receipts_by_method', COALESCE((
      SELECT jsonb_object_agg(m.method, m.total)
      FROM (
        SELECT r.method AS method, SUM(r.amount_idr)::BIGINT AS total
        FROM report_rows(p_tenant, p_outlet, v_from, v_to) r
        WHERE r.section = 'RECEIPT'
        GROUP BY r.method
      ) m
    ), '{}'::jsonb),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM report_rows(p_tenant, p_outlet, v_from, v_to) LIMIT v_limit
      ) r
    ), '[]'::jsonb)
  );
END;
$$;

-- ==================== §8.1 Overview: the owner's four questions ===========
-- "Production overdue" and "ready, not collected" are deliberately two
-- separate blocks — §5.5 says they are different problems with different
-- thresholds, so they are never merged into one "late" number.
CREATE OR REPLACE FUNCTION report_owner_overview(
  p_tenant UUID,
  p_outlet UUID DEFAULT NULL,
  p_item_limit INT DEFAULT 8
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_item_limit, 8), 1), 50);
BEGIN
  PERFORM app.report_guard(p_tenant, p_outlet);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'outlet_id', p_outlet,

    -- 1. Production overdue: work still in the shop past its own due time.
    'production_overdue', (
      WITH late AS (
        SELECT w.id, w.stage, w.due_at, o.order_number, c.name AS customer_name,
               ol.name AS outlet_name, sv.name AS service_name
        FROM work_items w
        JOIN orders    o  ON o.id  = w.order_id
        JOIN outlets   ol ON ol.id = w.outlet_id
        JOIN customers c  ON c.id  = o.customer_id
        LEFT JOIN order_lines      l  ON l.id  = w.line_id
        LEFT JOIN service_versions sv ON sv.id = l.service_version_id
        WHERE w.tenant_id = p_tenant
          AND (p_outlet IS NULL OR w.outlet_id = p_outlet)
          AND app.has_outlet(w.outlet_id)
          AND o.lifecycle = 'ACTIVE'
          AND w.stage NOT IN ('READY', 'CANCELLED')
          AND w.due_at < now()
      )
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM late),
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
          SELECT id, order_number, customer_name, outlet_name,
                 COALESCE(service_name, 'Layanan') AS service_name, stage, due_at
          FROM late ORDER BY due_at ASC LIMIT v_limit) t), '[]'::jsonb))
    ),

    -- 2. Ready but not collected: production is done, the goods are still ours.
    'ready_uncollected', (
      WITH ready AS (
        SELECT o.id, o.order_number, c.name AS customer_name, c.normalized_phone AS phone,
               ol.name AS outlet_name,
               (SELECT MAX(w.updated_at) FROM work_items w
                 WHERE w.order_id = o.id AND w.stage = 'READY') AS ready_at,
               (SELECT fp.rack_code FROM final_packages fp
                 WHERE fp.order_id = o.id ORDER BY fp.created_at DESC LIMIT 1) AS rack_code
        FROM orders o
        JOIN outlets   ol ON ol.id = o.outlet_id
        JOIN customers c  ON c.id  = o.customer_id
        WHERE o.tenant_id = p_tenant
          AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
          AND app.has_outlet(o.outlet_id)
          AND o.lifecycle = 'ACTIVE'
          AND o.custody_state = 'IN_CUSTODY'
          AND EXISTS (SELECT 1 FROM work_items w WHERE w.order_id = o.id AND w.stage = 'READY')
          AND NOT EXISTS (SELECT 1 FROM work_items w
                          WHERE w.order_id = o.id AND w.stage NOT IN ('READY', 'CANCELLED'))
      )
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM ready),
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
          SELECT id, order_number, customer_name, phone, outlet_name, rack_code, ready_at
          FROM ready ORDER BY ready_at ASC NULLS LAST LIMIT v_limit) t), '[]'::jsonb))
    ),

    -- 3. Receivables: live balance straight from the ledger view.
    'receivables', (
      WITH due AS (
        SELECT o.id, o.order_number, o.settlement_status, o.custody_state,
               c.name AS customer_name, c.normalized_phone AS phone,
               ol.name AS outlet_name, g.balance_idr
        FROM orders o
        JOIN outlets   ol ON ol.id = o.outlet_id
        JOIN customers c  ON c.id  = o.customer_id
        JOIN v_order_ledger g ON g.order_id = o.id
        WHERE o.tenant_id = p_tenant
          AND (p_outlet IS NULL OR o.outlet_id = p_outlet)
          AND app.has_outlet(o.outlet_id)
          AND o.lifecycle = 'ACTIVE'
          AND g.balance_idr > 0
      )
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM due),
        'total_idr', COALESCE((SELECT SUM(balance_idr) FROM due), 0)::BIGINT,
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
          SELECT id, order_number, customer_name, phone, outlet_name,
                 balance_idr, settlement_status, custody_state
          FROM due ORDER BY balance_idr DESC LIMIT v_limit) t), '[]'::jsonb))
    ),

    -- 4. Today's cash, per outlet calendar day (§5.5: outlet timezone decides
    --    when "today" starts, not the server's).
    'cash_today', (
      WITH scope AS (
        SELECT id, timezone,
               date_trunc('day', now() AT TIME ZONE timezone) AT TIME ZONE timezone AS day_start
        FROM outlets
        WHERE tenant_id = p_tenant AND (p_outlet IS NULL OR id = p_outlet) AND app.has_outlet(id)
      )
      SELECT jsonb_build_object(
        'received_idr', COALESCE((
          SELECT SUM(r.amount_idr) FROM receipts r
          JOIN orders o ON o.id = r.order_id
          JOIN scope s ON s.id = o.outlet_id
          WHERE r.confirmed_at >= s.day_start), 0)::BIGINT,
        'cash_idr', COALESCE((
          SELECT SUM(r.amount_idr) FROM receipts r
          JOIN orders o ON o.id = r.order_id
          JOIN scope s ON s.id = o.outlet_id
          WHERE r.confirmed_at >= s.day_start AND r.method = 'CASH'), 0)::BIGINT,
        'noncash_idr', COALESCE((
          SELECT SUM(r.amount_idr) FROM receipts r
          JOIN orders o ON o.id = r.order_id
          JOIN scope s ON s.id = o.outlet_id
          WHERE r.confirmed_at >= s.day_start AND r.method <> 'CASH'), 0)::BIGINT,
        'refunds_idr', COALESCE((
          SELECT SUM(f.amount_idr) FROM refunds f
          JOIN orders o ON o.id = f.order_id
          JOIN scope s ON s.id = o.outlet_id
          WHERE f.status = 'CONFIRMED' AND f.confirmed_at >= s.day_start), 0)::BIGINT,
        'expenses_idr', COALESCE((
          SELECT SUM(e.amount_idr) FROM expenses e
          JOIN scope s ON s.id = e.outlet_id
          WHERE e.created_at >= s.day_start), 0)::BIGINT,
        'open_sessions', COALESCE((
          SELECT COUNT(*) FROM cash_sessions cs
          JOIN scope s ON s.id = cs.outlet_id
          WHERE cs.status = 'OPEN'), 0)::INT,
        'timezone', COALESCE((
          SELECT CASE WHEN COUNT(DISTINCT timezone) = 1 THEN MIN(timezone) ELSE 'MIXED' END
          FROM scope), 'Asia/Jakarta')
      )
    )
  );
END;
$$;

-- ==================== FR36: audit trail, append-only, owner/supervisor ====
-- audit_events already carries an owner/supervisor RLS policy, but the browser
-- can only read its own users row (users_self), so actor names have to be
-- resolved here rather than by a client-side join.
CREATE OR REPLACE FUNCTION report_audit_events(
  p_tenant UUID,
  p_outlet UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100
) RETURNS TABLE (
  id          UUID,
  occurred_at TIMESTAMPTZ,
  actor_name  TEXT,
  actor_role  TEXT,
  action      TEXT,
  entity      TEXT,
  entity_id   UUID,
  outlet_name TEXT,
  payload     JSONB,
  request_id  TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_to    TIMESTAMPTZ := COALESCE(p_to, now());
  v_from  TIMESTAMPTZ := COALESCE(p_from, COALESCE(p_to, now()) - INTERVAL '7 days');
BEGIN
  PERFORM app.report_guard(p_tenant, p_outlet);

  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    COALESCE(u.full_name, 'Sistem')::TEXT,
    COALESCE(m.role, '—')::TEXT,
    a.action::TEXT,
    a.entity::TEXT,
    a.entity_id,
    COALESCE(ol.name, 'Semua Outlet')::TEXT,
    COALESCE(a.payload_after, a.payload_before, '{}'::jsonb),
    a.request_id::TEXT
  FROM audit_events a
  LEFT JOIN users       u  ON u.id  = a.actor_id
  LEFT JOIN memberships m  ON m.user_id = a.actor_id AND m.tenant_id = a.tenant_id
  LEFT JOIN outlets     ol ON ol.id = a.outlet_id
  WHERE a.tenant_id = p_tenant
    AND (p_outlet IS NULL OR a.outlet_id = p_outlet)
    AND (a.outlet_id IS NULL OR app.has_outlet(a.outlet_id))
    AND a.created_at >= v_from AND a.created_at < v_to
  ORDER BY a.created_at DESC
  LIMIT v_limit;
END;
$$;

-- ==================== FR31/FR36: every export leaves a trace ==============
-- The export route calls this once the file has been produced. Audit rows are
-- append-only (§12.2), so this record cannot later be edited away.
CREATE OR REPLACE FUNCTION report_log_export(
  p_tenant UUID,
  p_outlet UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_row_count INT DEFAULT 0,
  p_timezone TEXT DEFAULT NULL,
  p_filename TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payload JSONB;
BEGIN
  PERFORM app.report_guard(p_tenant, p_outlet);

  v_payload := jsonb_build_object(
    'format', 'csv',
    'outlet_id', p_outlet,
    'from', p_from,
    'to', p_to,
    'timezone', p_timezone,
    'row_count', COALESCE(p_row_count, 0),
    'filename', p_filename
  );

  PERFORM app.record(p_tenant, p_outlet, 'REPORT_EXPORTED', 'reports',
                     COALESCE(p_outlet, p_tenant), NULL, v_payload, p_request_id);

  RETURN v_payload;
END;
$$;

-- ---------------------------------------------------------------- grants --
REVOKE ALL ON FUNCTION
  app.report_guard(UUID, UUID),
  report_rows(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ),
  report_financial(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT),
  report_owner_overview(UUID, UUID, INT),
  report_audit_events(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT),
  report_log_export(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  report_rows(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ),
  report_financial(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT),
  report_owner_overview(UUID, UUID, INT),
  report_audit_events(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT),
  report_log_export(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT, TEXT)
TO authenticated;
