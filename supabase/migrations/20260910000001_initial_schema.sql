-- ========================================================================
-- LaundryFlow P0 Schema Migration — PostgreSQL / Supabase
-- Aligned with Laundry-PRD-and-System-Analysis-EN.md (Section 11, 12, 13)
-- Integer Rupiah (BIGINT), Integer Grams, Deterministic Snapshots, RLS
-- ========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TENANTS & OUTLETS
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outlets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    phone VARCHAR(50),
    address TEXT,
    opening_hours JSONB DEFAULT '{"open": "08:00", "close": "20:00"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 2. USERS & MEMBERSHIPS (RBAC)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_subject VARCHAR(255) UNIQUE, -- Supabase Auth UID
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'supervisor', 'cashier', 'operator', 'saas_admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE outlet_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id, outlet_id)
);

-- 3. CUSTOMERS
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    normalized_phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customers_tenant_name ON customers(tenant_id, name);
CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, normalized_phone);

-- 4. SERVICES & SERVICE VERSIONS (Snapshot Pricing)
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('kg', 'piece')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('kg', 'piece')),
    price_per_unit_idr BIGINT NOT NULL CHECK (price_per_unit_idr >= 0),
    min_grams INT DEFAULT 0,
    increment_grams INT DEFAULT 100,
    sla_hours INT DEFAULT 48,
    workflow_steps JSONB NOT NULL DEFAULT '["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ORDERS & ORDER LINES
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_number VARCHAR(100) NOT NULL,
    lifecycle VARCHAR(50) DEFAULT 'ACTIVE' CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'CANCELLED')),
    version INT DEFAULT 1,
    total_charges_idr BIGINT DEFAULT 0 CHECK (total_charges_idr >= 0),
    paid_amount_idr BIGINT DEFAULT 0 CHECK (paid_amount_idr >= 0),
    balance_idr BIGINT DEFAULT 0,
    settlement_status VARCHAR(50) DEFAULT 'UNPAID' CHECK (settlement_status IN ('UNPAID', 'PARTIAL', 'SETTLED', 'CREDIT_DUE', 'ZERO_CHARGE')),
    custody_state VARCHAR(50) DEFAULT 'IN_CUSTODY' CHECK (custody_state IN ('IN_CUSTODY', 'HANDED_OVER', 'RETURNED_ON_CANCEL')),
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    original_promised_at TIMESTAMPTZ NOT NULL,
    current_promised_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, outlet_id, order_number)
);
CREATE INDEX idx_orders_outlet_accepted ON orders(tenant_id, outlet_id, accepted_at);

CREATE TABLE order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_version_id UUID NOT NULL REFERENCES service_versions(id),
    actual_quantity INT NOT NULL CHECK (actual_quantity > 0),
    billable_quantity INT NOT NULL CHECK (billable_quantity > 0),
    rate_per_unit_idr BIGINT NOT NULL,
    subtotal_idr BIGINT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCTION WORK ITEMS, EVENTS & INTAKE BAGS
CREATE TABLE work_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_id UUID REFERENCES order_lines(id) ON DELETE SET NULL,
    stage VARCHAR(50) DEFAULT 'QUEUED' CHECK (stage IN ('QUEUED', 'WASHING', 'DRYING', 'IRONING', 'FOLDING', 'QC', 'READY', 'CANCELLED')),
    version INT DEFAULT 1,
    cycle INT DEFAULT 1,
    workflow_snapshot JSONB NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE intake_bags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    bag_code VARCHAR(100) NOT NULL,
    condition_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, bag_code)
);

CREATE TABLE work_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    from_stage VARCHAR(50) NOT NULL,
    to_stage VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. QC & FINAL PACKAGES & RACKS
CREATE TABLE final_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    package_code VARCHAR(100) NOT NULL,
    rack_code VARCHAR(100) NOT NULL,
    custody_state VARCHAR(50) DEFAULT 'IN_CUSTODY' CHECK (custody_state IN ('IN_CUSTODY', 'HANDED_OVER', 'RETURNED')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, package_code)
);

-- 8. FINANCIAL LEDGER & CASH SESSIONS
CREATE TABLE charge_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL CHECK (kind IN ('INITIAL', 'DEBIT_ADJUSTMENT', 'CREDIT_ADJUSTMENT')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr >= 0),
    actor_id UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    method VARCHAR(50) NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'QRIS')),
    confirmed_at TIMESTAMPTZ DEFAULT NOW(),
    verifier_id UUID REFERENCES users(id),
    reference VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES users(id),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_float_idr BIGINT NOT NULL DEFAULT 0,
    expected_cash_idr BIGINT NOT NULL DEFAULT 0,
    actual_cash_idr BIGINT,
    discrepancy_idr BIGINT,
    status VARCHAR(50) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    notes TEXT,
    reviewed_by UUID REFERENCES users(id)
);

CREATE TABLE cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    amount_signed_idr BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    session_id UUID REFERENCES cash_sessions(id),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    category VARCHAR(100) NOT NULL,
    method VARCHAR(50) DEFAULT 'CASH',
    notes TEXT,
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. HANDOVER & TRACKING
CREATE TABLE handovers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    receiver_name VARCHAR(255) NOT NULL,
    is_representative BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(100) DEFAULT 'RECEIPT_PRESENTED',
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tracking_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. AUDIT & IDEMPOTENCY
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    payload_before JSONB,
    payload_after JSONB,
    request_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE idempotency_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    command VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(255) NOT NULL,
    result_ref JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, actor_id, command, idempotency_key)
);
