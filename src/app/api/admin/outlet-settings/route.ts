import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/** GET /api/admin/outlet-settings?outlet_id= — outlet policy values. */
export const GET = asRoute(
  handle(async (ctx) => adminRpc(ctx, "get_outlet_settings", { p_outlet: ctx.params.outlet_id }))
);

/** POST /api/admin/outlet-settings — §5.5 the uncollected threshold is per outlet. */
export const POST = asRoute(
  handle(
    async (ctx) =>
      adminRpc(ctx, "update_outlet_settings", {
        p_outlet: ctx.body.outlet_id,
        p_threshold_days: ctx.body.uncollected_threshold_days,
        p_max_credit_limit_idr: ctx.body.max_credit_limit_idr,
        p_compensation_policy: ctx.body.compensation_policy ?? "",
        p_request_id: ctx.requestId,
      }),
    { requireIdempotency: true }
  )
);
