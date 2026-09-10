import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/orders/:id/revisions — Official numbered revision (PRD §5.6, FR13).
 * Requires supervisor/owner approval, expected version, and reason.
 * Creates delta charge entries and an audit event.
 */
export const runtime = "nodejs";

export const POST = handle(
  async ({ supabase, body, params, idempotencyKey, requestId }) => ({
    status: 200,
    data: await rpc(supabase, "revise_order", {
      p_order: params.id,
      p_expected_version: requireField<number>(body, "expected_version", "number"),
      p_new_lines: requireField<any[]>(body, "new_lines", "object"),
      p_new_discount_idr: body.new_discount_idr ?? 0,
      p_reason: requireField<string>(body, "reason", "string"),
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);
