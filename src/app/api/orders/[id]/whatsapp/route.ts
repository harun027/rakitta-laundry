import { handle, requireField, rpc } from "@/lib/api/route";

/**
 * POST /api/orders/:id/whatsapp — Logs manual WhatsApp link clicks for follow-up (PRD §14.1, FR34, FR35).
 */
export const runtime = "nodejs";

export const POST = handle(async ({ supabase, body, params }) => ({
  status: 200,
  data: await rpc(supabase, "log_manual_notification", {
    p_order: params.id,
    p_recipient_phone: requireField<string>(body, "recipient_phone", "string"),
    p_message_preview: requireField<string>(body, "message_preview", "string"),
  }),
}));
