import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* PRD §13.1 error contract: stable code, Indonesian message, field_errors,
 * request_id — and never SQL text or secrets. The database raises a machine
 * code with a PT4xx SQLSTATE; this module is the only place that turns those
 * into HTTP. */

const HTTP_BY_SQLSTATE: Record<string, number> = {
  PT400: 400,
  PT403: 403,
  PT404: 404,
  PT409: 409,
  PT422: 422,
};

/** Indonesian copy for every code the commands can raise. */
const MESSAGES: Record<string, string> = {
  unauthenticated: "Sesi Anda sudah berakhir. Masuk kembali untuk melanjutkan.",
  idempotency_key_required: "Permintaan tidak menyertakan kunci idempotensi.",
  idempotency_payload_mismatch:
    "Kunci permintaan ini sudah dipakai untuk data yang berbeda. Mulai transaksi baru.",
  idempotency_in_flight: "Permintaan yang sama masih diproses. Tunggu sebentar lalu periksa hasilnya.",
  version_conflict: "Data sudah diubah orang lain. Muat ulang, periksa, lalu ulangi.",
  outlet_forbidden: "Anda tidak punya akses ke outlet ini.",
  create_order_forbidden: "Peran Anda tidak berwenang membuat order.",
  production_forbidden: "Peran Anda tidak berwenang mengubah tahap produksi.",
  money_forbidden: "Peran Anda tidak berwenang menangani pembayaran.",
  verify_forbidden: "Verifikasi transfer hanya boleh dilakukan owner atau supervisor.",
  handover_forbidden: "Peran Anda tidak berwenang menyerahkan cucian.",
  credit_release_forbidden: "Pelepasan dengan piutang butuh persetujuan owner atau supervisor.",
  lines_required: "Order harus memiliki minimal satu layanan.",
  quantity_must_be_positive: "Berat atau jumlah harus lebih dari nol.",
  amount_must_be_positive: "Nominal harus lebih dari nol.",
  tendered_less_than_applied: "Uang yang diterima lebih kecil dari jumlah yang dibayarkan.",
  applied_exceeds_charges: "Pembayaran melebihi total tagihan order.",
  applied_exceeds_balance: "Pembayaran melebihi sisa tagihan saat ini. Muat ulang saldo.",
  open_cash_session_required: "Belum ada sesi laci kas yang terbuka di outlet ini.",
  service_version_not_found: "Layanan tidak ditemukan di outlet ini.",
  service_version_inactive: "Layanan sudah tidak aktif. Pilih layanan lain.",
  customer_not_found: "Pelanggan tidak ditemukan.",
  order_not_found: "Order tidak ditemukan.",
  outlet_not_found: "Outlet tidak ditemukan.",
  work_item_not_found: "Pekerjaan tidak ditemukan.",
  attempt_not_found: "Data pembayaran tidak ditemukan.",
  attempt_already_decided: "Pembayaran ini sudah diverifikasi atau ditolak.",
  invalid_transition: "Tahap tujuan tidak sesuai alur kerja order ini.",
  no_next_stage: "Pekerjaan sudah berada di tahap terakhir.",
  package_and_rack_required: "Isi nomor rak dan paket akhir sebelum status Siap Diambil.",
  work_not_ready: "Masih ada pekerjaan yang belum selesai.",
  already_handed_over: "Cucian sudah pernah diserahkan.",
  receiver_required: "Nama penerima fisik wajib dicatat.",
  credit_reason_required: "Alasan persetujuan kredit wajib dicatat.",
  credit_limit_exceeded: "Sisa tagihan melebihi batas persetujuan kredit.",
  append_only: "Catatan keuangan tidak bisa diubah atau dihapus.",
  internal: "Terjadi kesalahan di server. Coba lagi atau hubungi supervisor.",
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {}
  ) {
    super(code);
  }
}

function messageFor(code: string) {
  return MESSAGES[code] ?? MESSAGES.internal;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** Turns a PostgREST/RPC error into our envelope without leaking SQL. */
function fromDatabase(error: PostgrestLikeError): ApiError {
  const raised = (error.message ?? "").trim();
  const code = raised in MESSAGES ? raised : "internal";
  const status = HTTP_BY_SQLSTATE[error.code ?? ""] ?? (code === "internal" ? 500 : 400);
  return new ApiError(code, status);
}

export interface Ctx {
  supabase: Awaited<ReturnType<typeof createClient>>;
  body: Record<string, unknown>;
  requestId: string;
  /** §13.3 — supplied by the client and reused across retries; never generated here. */
  idempotencyKey: string | null;
  params: Record<string, string>;
}

/** Reads a required field, collecting a field-level error instead of throwing raw. */
export function requireField<T>(body: Record<string, unknown>, name: string, kind: "string" | "number" | "object"): T {
  const value = body[name];
  const ok =
    kind === "string"
      ? typeof value === "string" && value.length > 0
      : kind === "number"
        ? Number.isFinite(value)
        : typeof value === "object" && value !== null;
  if (!ok) throw new ApiError("validation_failed", 400, { [name]: "Wajib diisi." });
  return value as T;
}

/**
 * Wraps a Route Handler: authenticates, parses JSON, and formats every error the
 * same way. Handlers return a plain object that becomes the JSON body.
 */
export function handle(
  fn: (ctx: Ctx) => Promise<{ status?: number; data: unknown }>,
  options: { requireIdempotency?: boolean } = {}
) {
  return async (
    request: Request,
    segment: { params: Promise<Record<string, string>> } = { params: Promise.resolve({}) }
  ) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    try {
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new ApiError("unauthenticated", 401);

      const idempotencyKey = request.headers.get("idempotency-key");
      if (options.requireIdempotency && !idempotencyKey) {
        throw new ApiError("idempotency_key_required", 400);
      }

      let body: Record<string, unknown> = {};
      if (request.method !== "GET") {
        body = await request.json().catch(() => ({}));
      }

      const result = await fn({
        supabase,
        body,
        requestId,
        idempotencyKey,
        params: await segment.params,
      });

      return NextResponse.json(result.data, {
        status: result.status ?? 200,
        headers: { "x-request-id": requestId },
      });
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : isDatabaseError(error)
            ? fromDatabase(error)
            : new ApiError("internal", 500);

      if (apiError.status >= 500) {
        console.error(`[${requestId}]`, error);
      }

      return NextResponse.json(
        {
          code: apiError.code,
          message: messageFor(apiError.code),
          field_errors: apiError.fieldErrors,
          request_id: requestId,
        },
        { status: apiError.status, headers: { "x-request-id": requestId } }
      );
    }
  };
}

function isDatabaseError(error: unknown): error is PostgrestLikeError {
  return typeof error === "object" && error !== null && "message" in error;
}

/** Calls a command function and rethrows its error in our shape. */
export async function rpc<T>(
  supabase: Ctx["supabase"],
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw fromDatabase(error);
  return data as T;
}
