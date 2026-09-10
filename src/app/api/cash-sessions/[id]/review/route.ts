import { handle, rpc } from "@/lib/api/route";

/**
 * POST /api/cash-sessions/:id/review — a supervisor acknowledges a closing
 * discrepancy (PRD §8.2). It only stamps the reviewer; the discrepancy is never
 * written off, deleted, or turned into an expense.
 */
export const runtime = "nodejs";

const handler = handle(
  async ({ supabase, params, requestId }) => ({
    status: 200,
    data: await rpc(supabase, "review_cash_session", {
      p_session: params.id,
      p_request_id: requestId,
    }),
  }),
  { requireIdempotency: true }
);

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) =>
  handler(request, context);
