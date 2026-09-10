import { ApiErrorResponse } from "@/types";

export interface ApiFetchOptions extends RequestInit {
  idempotencyKey?: string;
}

/**
 * Client helper to call our Route Handlers with automatic Idempotency-Key
 * and unified error extraction based on PRD §13.1 & §13.3.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  // PRD §13.3 — writes should carry an Idempotency-Key
  if (options.method && options.method.toUpperCase() !== "GET") {
    if (!headers.has("Idempotency-Key")) {
      headers.set("Idempotency-Key", options.idempotencyKey || crypto.randomUUID());
    }
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
