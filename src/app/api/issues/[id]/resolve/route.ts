import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/issues/:id/resolve — Mark an issue as resolved (PRD §5.6, FR19).
 */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params }) => ({
  status: 200,
  data: await rpc(supabase, "resolve_order_issue", {
    p_issue: params.id,
    p_resolution: requireField<string>(body, "resolution", "string"),
  }),
}));
