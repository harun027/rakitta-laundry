import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Reporting reads are GET with query parameters, and the export answers with a
 * file rather than JSON — neither fits `handle()` in src/lib/api/route.ts,
 * which parses a JSON body and always replies with NextResponse.json. This is
 * the same §13.1 envelope { code, message, field_errors, request_id }, with the
 * copy for the codes the reporting functions raise. */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MESSAGES: Record<string, string> = {
  unauthenticated: "Sesi Anda sudah berakhir. Masuk kembali untuk melanjutkan.",
  report_forbidden:
    "Peran Anda tidak berwenang membuka laporan. Laporan, ekspor, dan audit hanya untuk owner dan supervisor.",
  outlet_forbidden: "Anda tidak punya akses ke outlet ini.",
  outlet_not_found: "Outlet tidak ditemukan.",
  invalid_interval: "Rentang tanggal tidak valid. Tanggal selesai harus setelah tanggal mulai.",
  validation_failed: "Parameter laporan belum lengkap.",
  internal: "Terjadi kesalahan di server. Coba lagi atau hubungi supervisor.",
};

const HTTP_BY_SQLSTATE: Record<string, number> = {
  PT400: 400,
  PT403: 403,
  PT404: 404,
  PT409: 409,
  PT422: 422,
};

export class ReportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {}
  ) {
    super(code);
  }
}

export interface ReportCtx {
  supabase: Supabase;
  query: URLSearchParams;
  requestId: string;
}

function envelope(error: ReportError, requestId: string) {
  return NextResponse.json(
    {
      code: error.code,
      message: MESSAGES[error.code] ?? MESSAGES.internal,
      field_errors: error.fieldErrors,
      request_id: requestId,
    },
    { status: error.status, headers: { "x-request-id": requestId } }
  );
}

/** Authenticates, hands over the query string, and shapes every failure the same way. */
export function reportRoute(fn: (ctx: ReportCtx) => Promise<Response>) {
  return async (request: Request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new ReportError("unauthenticated", 401);

      return await fn({ supabase, query: new URL(request.url).searchParams, requestId });
    } catch (error) {
      if (error instanceof ReportError) return envelope(error, requestId);

      // A PostgREST/RPC failure: the machine code travels in `message`, the
      // HTTP intent in the SQLSTATE. Never leak SQL text.
      const raised = error as { code?: string; message?: string };
      const text = (raised.message ?? "").trim();
      const code = text in MESSAGES ? text : "internal";
      const status = HTTP_BY_SQLSTATE[raised.code ?? ""] ?? (code === "internal" ? 500 : 400);
      if (status >= 500) console.error(`[${requestId}]`, error);
      return envelope(new ReportError(code, status), requestId);
    }
  };
}

export function json(data: unknown, requestId: string) {
  return NextResponse.json(data, { headers: { "x-request-id": requestId } });
}

export async function reportRpc<T>(supabase: Supabase, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function requireParam(query: URLSearchParams, name: string) {
  const value = query.get(name);
  if (!value) throw new ReportError("validation_failed", 400, { [name]: "Wajib diisi." });
  return value;
}

/** Shared argument shape: tenant is required, outlet optional (= all visible outlets). */
export function scopeArgs(query: URLSearchParams) {
  return {
    p_tenant: requireParam(query, "tenant"),
    p_outlet: query.get("outlet") || null,
    p_from: query.get("from") || null,
    p_to: query.get("to") || null,
  };
}
