import { json, reportRoute, reportRpc, scopeArgs } from "../shared";

export const runtime = "nodejs";

/**
 * GET /api/reports/audit?tenant=&outlet=&from=&to=&limit=
 * FR36 — the real append-only audit_events table. Actor names are resolved
 * server-side because the browser may only read its own users row.
 */
export const GET = reportRoute(async ({ supabase, query, requestId }) =>
  json(
    await reportRpc(supabase, "report_audit_events", {
      ...scopeArgs(query),
      p_limit: Number(query.get("limit") ?? 100),
    }),
    requestId
  )
);
