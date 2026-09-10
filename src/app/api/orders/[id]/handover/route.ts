import { handle, requireField, rpc } from "@/lib/api/route";

/** POST /api/orders/:id/handover — all packages at once, balance settled or an
 *  approved credit release, exactly one handover row (§5.4, FR21, FR22). */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "handover_order", {
      p_order: params.id,
      p_expected_version: requireField<number>(body, "expected_version", "number"),
      p_receiver: requireField<string>(body, "receiver_name", "string"),
      p_is_representative: body.is_representative ?? false,
      p_credit_reason: body.credit_reason ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
