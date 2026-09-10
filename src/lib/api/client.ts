import { ApiErrorResponse } from "@/types";

export interface ApiFetchOptions extends RequestInit {
  /** §13.3 — made once when the action begins and reused on every retry.
   *  Use `useIdempotencyKey()` from "@/lib/api/idempotency"; never inline a
   *  fresh `crypto.randomUUID()` at the call site. */
  idempotencyKey?: string;
}

/**
 * Client helper to call our Route Handlers with a caller-supplied
 * Idempotency-Key and unified error extraction based on PRD §13.1 & §13.3.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  // PRD §13.3 — every write carries a key the caller owns. Generating one here
  // would hand a retried-after-timeout request a brand new key, and the server
  // would happily create a second order. Fail loudly in development instead.
  const method = options.method?.toUpperCase() ?? "GET";
  if (method !== "GET") {
    if (!options.idempotencyKey) {
      throw new Error(
        `apiFetch(${url}): idempotencyKey wajib untuk ${method}. ` +
          "Ambil kunci dari useIdempotencyKey() saat aksi dimulai dan pakai ulang " +
          "kunci yang sama pada setiap percobaan ulang (PRD §13.3)."
      );
    }
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const errorData = data as ApiErrorResponse | null;
    const message =
      errorData?.message ||
      `Terjadi kesalahan HTTP ${res.status}: ${res.statusText || "Gagal memproses permintaan"}`;
    const err = new Error(message) as Error & {
      code?: string;
      field_errors?: Record<string, string>;
      request_id?: string;
      status?: number;
    };
    err.code = errorData?.code;
    err.field_errors = errorData?.field_errors;
    err.request_id = errorData?.request_id;
    err.status = res.status;
    throw err;
  }

  return data as T;
}
