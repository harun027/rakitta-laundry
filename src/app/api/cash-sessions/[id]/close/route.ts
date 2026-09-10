import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/cash-sessions/:id/close — Closes an active cash session with atomic
 * expected vs actual cash reconciliation and discrepancy calculation (PRD §9.5).
 */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 200,
    data: await rpc(supabase, "close_cash_session", {
      p_session: params.id,
      p_actual_cash: requireField<number>(body, "actual_cash_idr", "number"),
      p_notes: body.notes ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
