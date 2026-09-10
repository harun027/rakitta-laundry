import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/receipts/:id/refunds — Processes an approved refund or correction reversal (PRD §5.6, FR27).
 */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "process_refund", {
      p_receipt: params.id,
      p_amount_idr: requireField<number>(body, "amount_idr", "number"),
      p_reason: requireField<string>(body, "reason", "string"),
      p_kind: body.kind ?? "REAL_REFUND",
      p_session: body.session_id ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
