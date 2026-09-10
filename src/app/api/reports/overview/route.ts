import { json, reportRoute, reportRpc, requireParam } from "../shared";

export const runtime = "nodejs";

/**
 * GET /api/reports/overview?tenant=&outlet=
 * PRD §8.1 "Overview": production overdue, ready-but-uncollected, receivables,
 * today's cash. §5.5 keeps the first two apart on purpose.
 */
export const GET = reportRoute(async ({ supabase, query, requestId }) =>
  json(
    await reportRpc(supabase, "report_owner_overview", {
      p_tenant: requireParam(query, "tenant"),
      p_outlet: query.get("outlet") || null,
      p_item_limit: 8,
    }),
    requestId
  )
);
