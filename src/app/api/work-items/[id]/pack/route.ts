import { handle, requireField, rpc } from "@/lib/api/route";

export const runtime = "nodejs";

/**
 * POST /api/work-items/:id/pack — saves final package & rack code before READY.
 */
export const POST = handle(async ({ supabase, body, params }) => ({
  data: await rpc(supabase, "pack_and_rack_order", {
    p_work_item: params.id,
    p_rack_code: requireField<string>(body, "rack_code", "string"),
    p_package_code: body.package_code ?? null,
  }),
}));
