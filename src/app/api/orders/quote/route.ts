import { handle, rpc } from "@/lib/api/route";

/** POST /api/orders/quote — PRD §13.1. Prices only, creates nothing. */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body }) => ({
  data: await rpc(supabase, "quote_order", {
    p_outlet: body.outlet_id,
    p_lines: body.lines,
    p_discount_idr: body.discount_idr ?? 0,
  }),
}));
