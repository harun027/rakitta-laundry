import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/cash-sessions — Opens an atomic cash session drawer for an outlet.
 * Enforces one active drawer session per outlet (PRD §9.5, FR28).
 */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "open_cash_session", {
      p_outlet: requireField<string>(body, "outlet_id", "string"),
      p_opening_float: body.opening_float_idr ?? 0,
      p_notes: body.notes ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
