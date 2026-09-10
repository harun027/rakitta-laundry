import { handle, rpc } from "@/lib/api/route";

export const runtime = "nodejs";

/**
 * POST /api/customers — finds or creates a customer by normalized phone or name.
 */
export const POST = handle(async ({ supabase, body }) => {
  const outletId = body.outlet_id as string;
  const name = ((body.name as string) || "").trim();
  const phone = ((body.phone as string) || "").trim() || null;
  const notes = ((body.notes as string) || "").trim() || null;

  if (!name) {
    return {
      status: 400,
      data: { code: "validation_failed", message: "Nama pelanggan wajib diisi." },
    };
  }

  const data = await rpc(supabase, "find_or_create_customer", {
    p_outlet: outletId,
    p_name: name,
    p_phone: phone,
    p_notes: notes,
  });

  return { status: 200, data };
});
