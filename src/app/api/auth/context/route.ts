import { handle, rpc } from "@/lib/api/route";

export const runtime = "nodejs";

/** GET /api/auth/context — returns current user, tenant, memberships, and outlets */
export const GET = handle(async ({ supabase }) => {
  const data = await rpc(supabase, "get_my_context", {});
  return { status: 200, data };
});
