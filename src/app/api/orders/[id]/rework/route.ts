import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/orders/:id/rework — Initiate pre- or post-handover rework (PRD §5.7, FR20).
 */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params }) => ({
  status: 201,
  data: await rpc(supabase, "initiate_rework", {
    p_order: params.id,
    p_target_stage: requireField<string>(body, "target_stage", "string"),
    p_reason: requireField<string>(body, "reason", "string"),
    p_is_post_handover: body.is_post_handover ?? false,
  }),
}));
