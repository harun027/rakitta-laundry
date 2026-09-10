import { handle, requireField, rpc } from "@/lib/api/route";

/** POST /api/orders/:id/cancel — FR23, §5.6, §6.2 "Cancel". Service cancellation
 *  is not a refund and not a physical return: the settlement states explicitly
 *  what part of the bill is waived and whether the goods actually went back. */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    data: await rpc(supabase, "cancel_order", {
      p_order: params.id,
      p_expected_version: requireField<number>(body, "expected_version", "number"),
      p_settlement: body.settlement ?? {},
      p_reason: requireField<string>(body, "reason", "string"),
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
