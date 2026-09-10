# Database & API layer

Migrations run in filename order:

| File | Contents |
| --- | --- |
| `20260910000001_initial_schema.sql` | Base tables (§12.1) |
| `20260910000002_tenancy_rls.sql` | tenant_id everywhere, composite FKs, RLS, grants, ledger view |
| `20260910000003_commands.sql` | Pricing, order numbering, idempotency, the write commands |
| `20260910000004_onboarding_and_tracking.sql` | Bootstrap tenant/owner, session context, public tracking, pack & rack |

```bash
# 1. Hubungkan project Supabase Anda
npx supabase link --project-ref <project-ref>

# 2. Terapkan seluruh migrasi ke database Supabase
npx supabase db push
```

Copy `.env.example` ke `.env.local` dan isi kredensial Supabase Anda:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## How writes work

The browser never writes directly to a table. It calls a Route Handler, the handler
authenticates the Supabase session and calls one `SECURITY DEFINER` command
function, and that function does permission checks, money math, audit, and
outbox in **one transaction** (§11.2 step 4).

| Endpoint | Command | Guards |
| --- | --- | --- |
| `POST /api/onboarding` | `bootstrap_tenant` | auth required; creates tenant, outlet, owner, default catalog |
| `GET /api/auth/context` | `get_my_context` | returns caller profile, memberships, outlets |
| `POST /api/customers` | `find_or_create_customer` | tenant-scoped customer lookup & creation |
| `POST /api/orders/quote` | `quote_order` | outlet access; prices nothing else |
| `POST /api/orders` | `confirm_order` | idempotency, server recalculation, workflow snapshot, per-outlet number |
| `POST /api/work-items/:id/transitions` | `advance_work_item` | `expected_version`, workflow snapshot, rack before READY |
| `POST /api/work-items/:id/pack` | `pack_and_rack_order` | records final package and rack code |
| `POST /api/orders/:id/payment-attempts` | `create_payment_attempt` | non-cash stays out of the ledger |
| `POST /api/payment-attempts/:id/confirm` | `confirm_payment_attempt` | owner/supervisor only, one receipt per attempt |
| `POST /api/orders/:id/cash-receipts` | `record_cash_receipt` | order lock, balance recheck, tendered/change |
| `POST /api/orders/:id/handover` | `handover_order` | `expected_version`, all work ready, balance or approved credit |

Every write endpoint requires an `Idempotency-Key` header (handled automatically by `apiFetch`).
The client creates it once per user action and **reuses the same key on retry** — never generate a new
one after a timeout (§13.3).

Errors always look like:

```json
{ "code": "version_conflict", "message": "Data sudah diubah orang lain…",
  "field_errors": {}, "request_id": "…" }
```

## Verification Checklist on Supabase

After running `npx supabase db push`:

1. **Onboarding / Registration**: Buka `/onboarding`, daftar sebagai Owner outlet baru. Pastikan tenant, outlet, dan katalog layanan terisi otomatis.
2. **Login**: Buka `/login`, masuk dengan kredensial yang dibuat. Sesi langsung terhubung dengan RLS.
3. **POS Intake**: Buka `/cashier/new-order`, masukkan pesanan kiloan/satuan. Klik Konfirmasi & Simpan Order. Periksa nomor order di database format `OUT-YYMMDD-XXXXXX`.
4. **Alur Produksi**: Buka `/production`, geser tahap kerja dari `WASHING` ke `QC`, lalu masukkan kode rak untuk mencapai `READY`.
5. **Pelunasan & Serah Terima**: Buka `/cashier/orders`, lakukan pelunasan dan serah terima ke penerima fisik.
6. **Public Tracking**: Buka `/t/<token>`, pastikan data status cucian dapat dilihat pelanggan secara aman tanpa data sensitif.
