import { handle, rpc } from "@/lib/api/route";

export const runtime = "nodejs";

/** POST /api/onboarding — creates tenant, outlet, membership, catalog for current user */
export const POST = handle(async ({ supabase, body }) => {
  const businessName = (body.business_name as string) || "Laundry Bisnis";
  const outletName = (body.outlet_name as string) || "Outlet Utama";
  const timezone = (body.timezone as string) || "Asia/Jakarta";
  const outletPhone = (body.outlet_phone as string) || null;
  const ownerFullName = (body.owner_name as string) || "Owner Laundry";

  const data = await rpc(supabase, "bootstrap_tenant", {
    p_business_name: businessName,
    p_outlet_name: outletName,
    p_timezone: timezone,
    p_outlet_phone: outletPhone,
    p_owner_full_name: ownerFullName,
  });

  return { status: 201, data };
});
