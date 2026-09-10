import { handle } from "@/lib/api/route";
import { adminRpc, asRoute } from "@/lib/api/admin-rpc";

export const runtime = "nodejs";

/** GET /api/services?outlet_id= — FR04 catalog with the current version each. */
export const GET = asRoute(
  handle(async (ctx) => adminRpc(ctx, "list_services", { p_outlet: ctx.params.outlet_id }))
);

/**
 * POST /api/services — FR04. Publishes a NEW version; it never rewrites the
 * snapshot an existing order was priced with. Omit service_id to create a
 * service, send is_active=false to archive one.
 */
export const POST = asRoute(
  handle(
    async (ctx) =>
      adminRpc(ctx, "save_service_version", {
        p_outlet: ctx.body.outlet_id,
        p_name: ctx.body.name,
        p_unit: ctx.body.unit,
        p_price_idr: ctx.body.price_per_unit_idr,
        p_min_grams: ctx.body.min_grams ?? 0,
        p_increment_grams: ctx.body.increment_grams ?? 100,
        p_sla_hours: ctx.body.sla_hours ?? 48,
        p_workflow: ctx.body.workflow_steps ?? null,
        p_is_active: ctx.body.is_active ?? true,
        p_service: ctx.body.service_id ?? null,
        p_idempotency_key: ctx.idempotencyKey,
        p_request_id: ctx.requestId,
      }),
    { requireIdempotency: true }
  )
);
