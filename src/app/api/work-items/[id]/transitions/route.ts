import { handle, requireField, rpc } from "@/lib/api/route";

/** POST /api/work-items/:id/transitions — expected_version decides the winner
 *  when two operators tap at once (§13.2). */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params, requestId }) => ({
  data: await rpc(supabase, "advance_work_item", {
    p_work_item: params.id,
    p_expected_version: requireField<number>(body, "expected_version", "number"),
    p_to_stage: requireField<string>(body, "to_stage", "string"),
    p_reason: body.reason ?? null,
    p_request_id: requestId,
  }),
}));
