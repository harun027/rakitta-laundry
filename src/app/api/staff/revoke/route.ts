import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/**
 * POST /api/staff/revoke — FR02. With invitation_id it cancels an unused
 * invitation; with tenant_id + user_id it drops an accepted member's
 * membership and outlet access, which stops their session on the next request.
 */
export const POST = asRoute(
  handle(
    async (ctx) =>
      ctx.body.invitation_id
        ? adminRpc(ctx, "revoke_staff_invitation", {
            p_invitation: ctx.body.invitation_id,
            p_request_id: ctx.requestId,
          })
        : adminRpc(ctx, "revoke_staff_access", {
            p_tenant: ctx.body.tenant_id,
            p_user: ctx.body.user_id,
            p_request_id: ctx.requestId,
          }),
    { requireIdempotency: true }
  )
);
