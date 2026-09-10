import { handle, rpc } from "@/lib/api/route";

/** POST /api/orders — confirm an order. 201 on first call, the original result
 *  on any replay of the same Idempotency-Key (§11.2, §13.3). */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, idempotencyKey, requestId }) => ({
    status: 201,
    data: await rpc(supabase, "confirm_order", {
      p_outlet: body.outlet_id,
      p_customer: body.customer_id,
      p_lines: body.lines,
      p_discount_idr: body.discount_idr ?? 0,
      p_cash: body.cash ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
