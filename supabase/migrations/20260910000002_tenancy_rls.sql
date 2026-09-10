-- ========================================================================
-- 02 — Multi-tenancy, RLS, and integrity
-- PRD §10.1 RBAC, §10.2 threat model, §11.4 Supabase decisions,
--     §12.1 entities, §12.2 integrity rules
--
-- Design decisions encoded here:
--   * every tenant-scoped table carries tenant_id (§12.2)
--   * parent links use composite FKs (tenant_id, parent_id) so a valid id
--     from another tenant still cannot be referenced (§12.2)
--   * the browser gets SELECT only, filtered by RLS; every write goes through
--     a SECURITY DEFINER command function that checks permissions itself,
--     because "RLS does not replace business-action or approval checks" (§11.4)
-- ========================================================================

-- ------------------------------------------------------------------ app --
CREATE SCHEMA IF NOT EXISTS app;

-- Resolve the Supabase Auth subject to our own user row. SECURITY DEFINER so
-- the policies below do not recurse into users/memberships RLS.
CREATE OR REPLACE FUNCTION app.user_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_subject = auth.uid()::text AND status = 'ACTIVE'
$$;

CREATE OR REPLACE FUNCTION app.role_in(p_tenant UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM memberships
  WHERE tenant_id = p_tenant AND user_id = app.user_id()
$$;

CREATE OR REPLACE FUNCTION app.is_member(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT app.role_in(p_tenant) IS NOT NULL
$$;

-- Outlet membership. Owners and supervisors reach every outlet of their tenant;
-- cashiers and operators need an explicit outlet_access row (§10.1, FR03).
CREATE OR REPLACE FUNCTION app.has_outlet(p_outlet UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM outlets o
    WHERE o.id = p_outlet
      AND (
        app.role_in(o.tenant_id) IN ('owner', 'supervisor')
        OR EXISTS (
          SELECT 1 FROM outlet_access oa
          WHERE oa.outlet_id = o.id AND oa.user_id = app.user_id()
        )
      )
  )
$$;

/** Financial visibility: production operators must never see money (§10.1/§10.2). */
CREATE OR REPLACE FUNCTION app.can_see_money(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT app.role_in(p_tenant) IN ('owner', 'supervisor', 'cashier')
$$;

-- ----------------------------------------------- composite parent uniques --
ALTER TABLE outlets           ADD CONSTRAINT outlets_id_tenant_key           UNIQUE (id, tenant_id);
ALTER TABLE customers         ADD CONSTRAINT customers_id_tenant_key         UNIQUE (id, tenant_id);
ALTER TABLE orders            ADD CONSTRAINT orders_id_tenant_key            UNIQUE (id, tenant_id);
-- cash_sessions gets its composite key after tenant_id is added below.

-- ------------------------------------------------- tenant_id backfill/add --
-- The project has no production data yet, so these columns are added and then
-- immediately constrained rather than migrated in phases.

ALTER TABLE services         ADD COLUMN tenant_id UUID;
ALTER TABLE service_versions ADD COLUMN tenant_id UUID, ADD COLUMN outlet_id UUID;
ALTER TABLE order_lines      ADD COLUMN tenant_id UUID;
ALTER TABLE work_items       ADD COLUMN tenant_id UUID, ADD COLUMN outlet_id UUID;
ALTER TABLE work_events      ADD COLUMN tenant_id UUID;
ALTER TABLE charge_entries   ADD COLUMN tenant_id UUID;
ALTER TABLE receipts         ADD COLUMN tenant_id UUID;
ALTER TABLE handovers        ADD COLUMN tenant_id UUID;
ALTER TABLE tracking_tokens  ADD COLUMN tenant_id UUID;
ALTER TABLE cash_sessions    ADD COLUMN tenant_id UUID, ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE cash_movements   ADD COLUMN tenant_id UUID;
ALTER TABLE expenses         ADD COLUMN tenant_id UUID;

UPDATE services         s SET tenant_id = o.tenant_id FROM outlets o WHERE o.id = s.outlet_id;
UPDATE service_versions v SET tenant_id = s.tenant_id, outlet_id = s.outlet_id FROM services s WHERE s.id = v.service_id;
UPDATE order_lines      l SET tenant_id = o.tenant_id FROM orders o WHERE o.id = l.order_id;
UPDATE work_items       w SET tenant_id = o.tenant_id, outlet_id = o.outlet_id FROM orders o WHERE o.id = w.order_id;
UPDATE work_events      e SET tenant_id = w.tenant_id FROM work_items w WHERE w.id = e.work_item_id;
UPDATE charge_entries   c SET tenant_id = o.tenant_id FROM orders o WHERE o.id = c.order_id;
UPDATE receipts         r SET tenant_id = o.tenant_id FROM orders o WHERE o.id = r.order_id;
UPDATE handovers        h SET tenant_id = o.tenant_id FROM orders o WHERE o.id = h.order_id;
UPDATE tracking_tokens  t SET tenant_id = o.tenant_id FROM orders o WHERE o.id = t.order_id;
UPDATE cash_sessions    s SET tenant_id = o.tenant_id FROM outlets o WHERE o.id = s.outlet_id;
UPDATE cash_movements   m SET tenant_id = s.tenant_id FROM cash_sessions s WHERE s.id = m.session_id;
UPDATE expenses         e SET tenant_id = o.tenant_id FROM outlets o WHERE o.id = e.outlet_id;

ALTER TABLE services         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE service_versions ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN outlet_id SET NOT NULL;
ALTER TABLE order_lines      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE work_items       ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN outlet_id SET NOT NULL;
ALTER TABLE work_events      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE charge_entries   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE receipts         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE handovers        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tracking_tokens  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cash_sessions    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cash_movements   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE expenses         ALTER COLUMN tenant_id SET NOT NULL;

-- ---------------------------------------------------- composite foreign keys --
ALTER TABLE orders
  ADD CONSTRAINT orders_outlet_same_tenant   FOREIGN KEY (outlet_id, tenant_id)   REFERENCES outlets (id, tenant_id),
  ADD CONSTRAINT orders_customer_same_tenant FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id);

ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE charge_entries
  ADD CONSTRAINT charge_entries_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE handovers
  ADD CONSTRAINT handovers_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE,
  -- §6.3 invariant 6: concurrent release requests create only one handover.
  ADD CONSTRAINT handovers_one_per_order UNIQUE (order_id);

ALTER TABLE intake_bags
  ADD CONSTRAINT intake_bags_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE final_packages
  ADD CONSTRAINT final_packages_order_same_tenant FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE;

ALTER TABLE cash_sessions ADD CONSTRAINT cash_sessions_id_tenant_key UNIQUE (id, tenant_id);

-- One active session per drawer (§12.1 partial uniqueness).
CREATE UNIQUE INDEX cash_sessions_one_open_per_outlet
  ON cash_sessions (outlet_id) WHERE status = 'OPEN';

-- --------------------------------------------------------- new P0 tables --

-- FR26 / §6.1 — non-cash money is an attempt until a person verifies it.
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    method VARCHAR(50) NOT NULL CHECK (method IN ('TRANSFER', 'QRIS')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK (status IN ('PENDING_VERIFICATION', 'CONFIRMED', 'REJECTED')),
    reference VARCHAR(255),
    created_by UUID REFERENCES users(id),
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX idx_payment_attempts_open ON payment_attempts (tenant_id, status, created_at);

-- Each confirmed attempt produces at most one receipt (§12.1).
ALTER TABLE receipts
  ADD COLUMN source_attempt_id UUID REFERENCES payment_attempts(id),
  ADD COLUMN tendered_idr BIGINT,
  ADD COLUMN change_idr BIGINT,
  ADD COLUMN session_id UUID REFERENCES cash_sessions(id),
  ADD CONSTRAINT receipts_one_per_attempt UNIQUE (source_attempt_id);

-- §9.2 — a real refund moves money; a reversal only corrects a wrong record.
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    receipt_id UUID NOT NULL REFERENCES receipts(id),
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('REFUND', 'REVERSAL')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    method VARCHAR(50) CHECK (method IN ('CASH', 'TRANSFER', 'QRIS')),
    status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'APPROVED', 'CONFIRMED', 'REJECTED')),
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES users(id),
    session_id UUID REFERENCES cash_sessions(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders (id, tenant_id) ON DELETE CASCADE
);

-- §12.2 — display numbers are allocated per outlet and need not be gapless.
CREATE TABLE outlet_number_counters (
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    last_seq INT NOT NULL DEFAULT 0,
    PRIMARY KEY (outlet_id, day)
);

-- §11.2 step 4 — the outbox is written in the same transaction as its command.
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    aggregate_id UUID NOT NULL,
    aggregate_version INT NOT NULL,
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    state VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'SENT', 'FAILED')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_outbox_due ON outbox_events (state, next_attempt_at);

-- --------------------------------------------------------------- indexes --
CREATE INDEX idx_work_items_queue    ON work_items (tenant_id, outlet_id, stage, due_at);
CREATE INDEX idx_receipts_order      ON receipts (order_id, confirmed_at);
CREATE INDEX idx_audit_entity        ON audit_events (entity_id, created_at);
CREATE INDEX idx_orders_keyset       ON orders (tenant_id, outlet_id, accepted_at DESC, id DESC);

-- ---------------------------------------------------- append-only guards --
-- §12.2: application-level append-only. This is not DBA tamper resistance, it
-- only stops the application role from rewriting history.
CREATE OR REPLACE FUNCTION app.deny_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append_only: % rows cannot be modified or deleted', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER audit_events_append_only  BEFORE UPDATE OR DELETE ON audit_events  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER work_events_append_only   BEFORE UPDATE OR DELETE ON work_events   FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER receipts_append_only      BEFORE UPDATE OR DELETE ON receipts      FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER charge_entries_append_only BEFORE UPDATE OR DELETE ON charge_entries FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER expenses_append_only      BEFORE UPDATE OR DELETE ON expenses      FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

-- ------------------------------------------------------------- ledger view --
-- §9.2 source of truth. orders.balance_idr/settlement_status are a cache that
-- commands maintain; this view is what a daily reconciliation compares against.
CREATE OR REPLACE VIEW v_order_ledger WITH (security_invoker = true) AS
SELECT
  o.id AS order_id,
  o.tenant_id,
  o.outlet_id,
  GREATEST(0, COALESCE(c.net_charges, 0))                     AS net_charges_idr,
  COALESCE(r.receipts, 0) - COALESCE(f.refunds, 0)            AS net_received_idr,
  GREATEST(0, COALESCE(c.net_charges, 0))
    - (COALESCE(r.receipts, 0) - COALESCE(f.refunds, 0))      AS balance_idr
FROM orders o
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN kind = 'CREDIT_ADJUSTMENT' THEN -amount_idr ELSE amount_idr END) AS net_charges
  FROM charge_entries WHERE order_id = o.id
) c ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(amount_idr) AS receipts FROM receipts WHERE order_id = o.id
) r ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(amount_idr) AS refunds FROM refunds
  WHERE order_id = o.id AND status = 'CONFIRMED'
) f ON TRUE;

-- ------------------------------------------------------------------- RLS --
ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_access       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE services            ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_bags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE handovers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_number_counters ENABLE ROW LEVEL SECURITY;

-- Identity
CREATE POLICY users_self ON users FOR SELECT USING (auth_subject = auth.uid()::text);
CREATE POLICY tenants_member ON tenants FOR SELECT USING (app.is_member(id));
CREATE POLICY memberships_member ON memberships FOR SELECT USING (app.is_member(tenant_id));
CREATE POLICY outlet_access_member ON outlet_access FOR SELECT USING (app.is_member(tenant_id));
CREATE POLICY outlets_scoped ON outlets FOR SELECT USING (app.has_outlet(id));

-- Catalog
CREATE POLICY services_scoped ON services FOR SELECT USING (app.has_outlet(outlet_id));
CREATE POLICY service_versions_scoped ON service_versions FOR SELECT USING (app.has_outlet(outlet_id));

-- Customers: operators never reach the customer directory (§12.2).
CREATE POLICY customers_scoped ON customers FOR SELECT
  USING (app.role_in(tenant_id) IN ('owner', 'supervisor', 'cashier'));

-- Operational rows follow the outlet the row belongs to.
CREATE POLICY orders_scoped      ON orders      FOR SELECT USING (app.has_outlet(outlet_id));
CREATE POLICY work_items_scoped  ON work_items  FOR SELECT USING (app.has_outlet(outlet_id));
CREATE POLICY order_lines_scoped ON order_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_lines.order_id AND app.has_outlet(o.outlet_id)));
CREATE POLICY work_events_scoped ON work_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM work_items w WHERE w.id = work_events.work_item_id AND app.has_outlet(w.outlet_id)));
CREATE POLICY intake_bags_scoped ON intake_bags FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = intake_bags.order_id AND app.has_outlet(o.outlet_id)));
CREATE POLICY final_packages_scoped ON final_packages FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = final_packages.order_id AND app.has_outlet(o.outlet_id)));
CREATE POLICY handovers_scoped ON handovers FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = handovers.order_id AND app.has_outlet(o.outlet_id)));

-- Money rows additionally require a money-capable role.
CREATE POLICY charge_entries_money ON charge_entries FOR SELECT USING (app.can_see_money(tenant_id));
CREATE POLICY receipts_money       ON receipts       FOR SELECT USING (app.can_see_money(tenant_id));
CREATE POLICY attempts_money       ON payment_attempts FOR SELECT USING (app.can_see_money(tenant_id));
CREATE POLICY refunds_money        ON refunds        FOR SELECT USING (app.can_see_money(tenant_id));
CREATE POLICY cash_sessions_money  ON cash_sessions  FOR SELECT USING (app.can_see_money(tenant_id) AND app.has_outlet(outlet_id));
CREATE POLICY cash_movements_money ON cash_movements FOR SELECT USING (app.can_see_money(tenant_id));
CREATE POLICY expenses_money       ON expenses       FOR SELECT USING (app.can_see_money(tenant_id) AND app.has_outlet(outlet_id));

-- Audit is readable by owner/supervisor only (§10.1 reports/exports/audit).
CREATE POLICY audit_read ON audit_events FOR SELECT
  USING (app.role_in(tenant_id) IN ('owner', 'supervisor'));

-- Tokens, idempotency, outbox, counters: no browser reads at all. RLS is on
-- with no permissive policy, so they are invisible even if a grant slips back.

-- ---------------------------------------------------------------- grants --
-- §11.4: revoke unnecessary direct browser grants; writes go through commands.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
-- RLS policy expressions run as the querying role, so it must be able to reach
-- the helper functions those policies call.
GRANT USAGE ON SCHEMA app TO authenticated, anon;
GRANT SELECT ON
  tenants, outlets, users, memberships, outlet_access, customers,
  services, service_versions, orders, order_lines, work_items, work_events,
  intake_bags, final_packages, charge_entries, receipts, payment_attempts,
  refunds, cash_sessions, cash_movements, expenses, handovers, audit_events,
  v_order_ledger
TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
