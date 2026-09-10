import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/payment-attempts/:id/reject — Rejects an unverified payment attempt (PRD §6.1, FR26).
 */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params }) => {
  const attemptId = params.id;
  const reason = body.reason || "Mutasi rekening tidak ditemukan atau nominal tidak sesuai";

  const { data, error } = await supabase
    .from("payment_attempts")
    .update({
      status: "REJECTED",
      notes: reason,
      decided_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    status: 200,
    data: {
      attempt_id: attemptId,
      status: "REJECTED",
      reason,
    },
  };
});
