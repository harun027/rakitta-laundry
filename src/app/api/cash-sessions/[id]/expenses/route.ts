import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/cash-sessions/:id/expenses — Records an operational cash expense
 * immediately linked to the active drawer session (PRD §7.4, FR29).
 */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "record_cash_expense", {
      p_outlet: requireField<string>(body, "outlet_id", "string"),
      p_session: params.id,
      p_category: requireField<string>(body, "category", "string"),
      p_amount_idr: requireField<number>(body, "amount_idr", "number"),
      p_notes: body.notes ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
