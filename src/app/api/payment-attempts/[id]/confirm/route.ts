import { handle, rpc } from "@/lib/api/route";

/** POST /api/payment-attempts/:id/confirm — the verifier checked the mutation.
 *  Produces exactly one receipt per attempt (§12.1). */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, params, idempotencyKey, requestId }) => ({
    data: await rpc(supabase, "confirm_payment_attempt", {
      p_attempt: params.id,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
