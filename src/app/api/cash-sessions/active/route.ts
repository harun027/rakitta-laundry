import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * GET /api/cash-sessions/active?outlet_id=… — the outlet's single OPEN drawer
 * session with its §9.5 components, expense list, and the non-cash total that
 * stays outside the drawer. Returns { session: null } when nothing is open.
 */
export const runtime = "nodejs";

export const GET = (request: Request) =>
  handle(async ({ supabase, params }) => ({
    status: 200,
    data: await rpc(supabase, "get_active_cash_session", {
      p_outlet: requireField<string>(params, "outlet_id", "string"),
    }),
  }))(request, {
    // handle() only reads route segments; the outlet arrives in the query string.
    params: Promise.resolve({ outlet_id: new URL(request.url).searchParams.get("outlet_id") ?? "" }),
  });
