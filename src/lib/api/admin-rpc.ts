import type { Ctx } from "./route";

/* PRD §13.1 — the administration commands raise their own codes. `rpc()` in
 * route.ts only knows the codes the P0 order commands raise and collapses the
 * rest into a generic "internal" message, which would hide a perfectly clear
 * validation error from the person filling the form. This module keeps the
 * same envelope shape {code, message, field_errors, request_id} and adds the
 * Indonesian copy for the codes 20260910000014_admin_catalog_staff.sql raises.
 */

const STATUS_BY_SQLSTATE: Record<string, number> = {
  PT400: 400,
  PT401: 401,
  PT403: 403,
  PT404: 404,
  PT409: 409,
  PT422: 422,
};

const MESSAGES: Record<string, string> = {
  // permission
  catalog_forbidden: "Hanya owner atau supervisor yang boleh mengubah layanan dan harga.",
  staff_forbidden: "Hanya owner yang boleh mengelola staf dan undangan.",
  billing_forbidden: "Hanya owner yang boleh melihat status langganan.",
  customer_forbidden: "Peran Anda tidak berwenang membuka direktori pelanggan.",
  money_forbidden: "Peran Anda tidak berwenang melihat data tagihan.",
  outlet_forbidden: "Anda tidak punya akses ke outlet ini.",
  // validation
  name_required: "Nama wajib diisi.",
  invalid_unit: "Satuan harus kg atau satuan (pcs).",
  invalid_email: "Format email belum benar.",
  invalid_role: "Peran yang dipilih tidak dikenal.",
  invalid_workflow: "Alur kerja harus mulai dari QUEUED dan berakhir di READY.",
  invalid_threshold_days: "Ambang hari harus antara 1 dan 60 hari.",
  price_must_not_be_negative: "Tarif tidak boleh negatif.",
  min_must_not_be_negative: "Minimum tidak boleh negatif.",
  increment_must_be_positive: "Kelipatan harus lebih dari nol.",
  sla_must_be_positive: "Target SLA harus lebih dari nol jam.",
  outlet_required: "Kasir dan operator wajib ditugaskan minimal ke satu outlet.",
  // state
  already_a_member: "Email ini sudah terdaftar sebagai staf di bisnis Anda.",
  invitation_not_found: "Undangan tidak ditemukan.",
  invitation_expired: "Undangan sudah kedaluwarsa. Minta owner mengirim undangan baru.",
  invitation_revoked: "Undangan sudah dicabut oleh owner.",
  invitation_already_accepted: "Undangan ini sudah pernah dipakai.",
  invitation_email_mismatch: "Undangan ini ditujukan untuk alamat email lain.",
  member_not_found: "Staf tidak ditemukan di bisnis ini.",
  cannot_revoke_owner: "Akses owner tidak bisa dicabut dari halaman ini.",
  service_version_not_found: "Layanan tidak ditemukan di outlet ini.",
  outlet_not_found: "Outlet tidak ditemukan.",
  order_not_found: "Order tidak ditemukan.",
  // shared with route.ts
  unauthenticated: "Sesi Anda sudah berakhir. Masuk kembali untuk melanjutkan.",
  idempotency_key_required: "Permintaan tidak menyertakan kunci idempotensi.",
  idempotency_payload_mismatch:
    "Kunci permintaan ini sudah dipakai untuk data yang berbeda. Mulai lagi dari awal.",
  idempotency_in_flight: "Permintaan yang sama masih diproses. Tunggu sebentar lalu muat ulang.",
  append_only: "Versi layanan yang sudah dipakai order tidak bisa diubah. Terbitkan versi baru.",
  internal: "Terjadi kesalahan di server. Coba lagi atau hubungi supervisor.",
};

/**
 * Calls an administration RPC and always resolves to something `handle()` can
 * return: 200 with the data, or the error envelope with the right status.
 */
export async function adminRpc(
  ctx: Pick<Ctx, "supabase" | "requestId">,
  name: string,
  args: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { data, error } = await ctx.supabase.rpc(name, args);

  if (!error) return { status: 200, data };

  const raised = (error.message ?? "").trim();
  // "append_only: …" carries a detail suffix; match on the leading code.
  const code = raised in MESSAGES ? raised : raised.split(":")[0].trim() in MESSAGES
    ? raised.split(":")[0].trim()
    : "internal";
  const status = STATUS_BY_SQLSTATE[error.code ?? ""] ?? (code === "internal" ? 500 : 400);

  if (status >= 500) console.error(`[${ctx.requestId}] ${name}`, error);

  return {
    status,
    data: {
      code,
      message: MESSAGES[code],
      field_errors: {},
      request_id: ctx.requestId,
    },
  };
}

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (request: Request, segment: RouteCtx) => Promise<Response>;

/**
 * Wraps a `handle()` result into a Route Handler export.
 *
 * Two jobs: it gives the export the exact (request, context) signature Next
 * type-checks route files against, and it folds the query string into
 * `ctx.params`, which is the only channel `handle()` gives a GET handler for
 * reading its inputs.
 */
export function asRoute(handler: Handler) {
  return (request: Request, context: RouteCtx) => {
    const params = (async () => ({
      ...Object.fromEntries(new URL(request.url).searchParams),
      ...(context ? await context.params : {}),
    }))();
    return handler(request, { params });
  };
}
