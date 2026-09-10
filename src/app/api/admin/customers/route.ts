import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/**
 * GET /api/admin/customers?outlet_id=&q= — FR07. A query shorter than two
 * characters comes back empty on purpose: search needs input, and an empty box
 * must not dump the contact book.
 */
export const GET = asRoute(
  handle(async (ctx) =>
    adminRpc(ctx, "search_customers", {
      p_outlet: ctx.params.outlet_id,
      p_query: ctx.params.q ?? "",
      p_limit: Number(ctx.params.limit ?? 20) || 20,
    })
  )
);
