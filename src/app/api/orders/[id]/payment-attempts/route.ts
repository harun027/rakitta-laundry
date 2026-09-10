import { handle, requireField, rpc } from "@/lib/api/route";

/** POST /api/orders/:id/payment-attempts — transfer/QRIS claim. Pending until a
 *  person verifies the bank activity; no ledger effect yet (FR26). */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "create_payment_attempt", {
      p_order: params.id,
      p_method: requireField<string>(body, "method", "string"),
      p_amount: requireField<number>(body, "amount_idr", "number"),
      p_reference: body.reference ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
