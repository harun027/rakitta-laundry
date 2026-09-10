import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/**
 * GET /api/admin/follow-ups?outlet_id= — FR35. Reading the queue schedules
 * nothing; every reminder stays a manual action by a person.
 */
export const GET = asRoute(
  handle(async (ctx) => adminRpc(ctx, "list_follow_ups", { p_outlet: ctx.params.outlet_id }))
);
