import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/**
 * POST /api/staff/accept — FR02. The invited person, signed in with the
 * invited address, exchanges the token for a membership. Expired, revoked, or
 * already used invitations are refused.
 */
export const POST = asRoute(
  handle(
    async (ctx) =>
      adminRpc(ctx, "accept_staff_invitation", {
        p_token: ctx.body.token,
        p_request_id: ctx.requestId,
      }),
    { requireIdempotency: true }
  )
);
