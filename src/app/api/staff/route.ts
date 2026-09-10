import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/** GET /api/staff?tenant_id= — members plus invitations that are still open. */
export const GET = asRoute(
  handle(async (ctx) => adminRpc(ctx, "list_staff", { p_tenant: ctx.params.tenant_id }))
);

/**
 * POST /api/staff — FR02. Returns the one-time invite path; the raw token is
 * never stored or logged, only its hash lives in the database.
 */
export const POST = asRoute(
  handle(
    async (ctx) =>
      adminRpc(ctx, "create_staff_invitation", {
        p_tenant: ctx.body.tenant_id,
        p_email: ctx.body.email,
        p_full_name: ctx.body.full_name,
        p_role: ctx.body.role,
        p_outlets: ctx.body.outlet_ids ?? [],
        p_idempotency_key: ctx.idempotencyKey,
        p_request_id: ctx.requestId,
      }),
    { requireIdempotency: true }
  )
);
