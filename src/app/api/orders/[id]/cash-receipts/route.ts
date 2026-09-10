import { handle, requireField, rpc } from "@/lib/api/route";

/** POST /api/orders/:id/cash-receipts — locks the order, rechecks the balance
 *  under that lock, records only the applied amount and returns the change (§9.2). */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "record_cash_receipt", {
      p_order: params.id,
      p_applied_idr: requireField<number>(body, "applied_idr", "number"),
      p_tendered_idr: body.tendered_idr ?? null,
      p_session: requireField<string>(body, "session_id", "string"),
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
