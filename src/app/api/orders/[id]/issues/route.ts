import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/orders/:id/issues — Report an operational blocker/issue (PRD §5.6, FR19).
 */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params }) => ({
  status: 201,
  data: await rpc(supabase, "report_order_issue", {
    p_order: params.id,
    p_category: requireField<string>(body, "category", "string"),
    p_severity: body.severity ?? "MEDIUM",
    p_description: requireField<string>(body, "description", "string"),
    p_is_blocking: body.is_blocking ?? true,
    p_work_item: body.work_item_id ?? null,
  }),
}));
