import { json, reportRoute, reportRpc, scopeArgs } from "./shared";

export const runtime = "nodejs";

/**
 * GET /api/reports?tenant=&outlet=&from=&to=
 * FR30 — summary plus the drill-down rows it was aggregated from, so the two
 * can never disagree. Permission is checked inside report_financial().
 */
export const GET = reportRoute(async ({ supabase, query, requestId }) =>
  json(
    await reportRpc(supabase, "report_financial", { ...scopeArgs(query), p_row_limit: 500 }),
    requestId
  )
);
