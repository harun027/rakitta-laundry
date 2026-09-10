import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/** GET /api/admin/subscription?tenant_id= — FR37 plan state for Settings. */
export const GET = asRoute(
  handle(async (ctx) => adminRpc(ctx, "get_subscription", { p_tenant: ctx.params.tenant_id }))
);
