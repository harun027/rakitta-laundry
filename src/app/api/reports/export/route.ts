import { csvDocument, safeFilename } from "../csv";
import { reportRoute, reportRpc, requireParam, ReportError } from "../shared";

export const runtime = "nodejs";

interface ReportRow {
  section: string;
  occurred_at: string;
  outlet_name: string | null;
  order_number: string | null;
  customer_name: string | null;
  detail: string | null;
  method: string | null;
  amount_idr: number;
}

const SECTION_LABEL: Record<string, string> = {
  ORDER_VALUE: "Nilai Order",
  RECEIPT: "Uang Diterima",
  REFUND: "Refund Dibayarkan",
  EXPENSE: "Pengeluaran Kas",
  RECEIVABLE: "Piutang (per akhir interval)",
};

const SECTION_ORDER = ["ORDER_VALUE", "RECEIPT", "REFUND", "EXPENSE", "RECEIVABLE"];

/**
 * GET /api/reports/export?tenant=&outlet=&from=&to=
 *
 * FR31 — UTF-8 CSV, formula-injection safe, carrying its own interval, outlet
 * and timezone; owner/supervisor only, checked by report_rows() on the server
 * rather than by the page that asked. FR36 — the export itself is audited.
 *
 * Not W05 yet: the file is streamed straight back on this response. There is
 * no private, expiring Supabase Storage object and no background worker.
 */
export const GET = reportRoute(async ({ supabase, query, requestId }) => {
  const tenant = requireParam(query, "tenant");
  const outlet = query.get("outlet") || null;
  // Explicit here, unlike the JSON endpoints: a downloaded file must state the
  // exact interval it covers, so we never let the database pick a default.
  const from = requireParam(query, "from");
  const to = requireParam(query, "to");

  const rows = await reportRpc<ReportRow[]>(supabase, "report_rows", {
    p_tenant: tenant,
    p_outlet: outlet,
    p_from: from,
    p_to: to,
  });

  // Outlet identity for the header. RLS already limits this to outlets the
  // caller may see, and report_rows() has re-checked the role.
  let outletQuery = supabase.from("outlets").select("name, timezone").eq("tenant_id", tenant);
  if (outlet) outletQuery = outletQuery.eq("id", outlet);
  const { data: outlets, error: outletError } = await outletQuery;
  if (outletError) throw outletError;
  if (!outlets?.length) throw new ReportError("outlet_not_found", 404);

  const zones = [...new Set(outlets.map((o) => o.timezone ?? "Asia/Jakarta"))];
  const timezone = zones.length === 1 ? zones[0] : "MIXED";
  const outletLabel = outlet ? outlets[0].name : `Semua Outlet (${outlets.length})`;

  const displayZone = zones.length === 1 ? zones[0] : "Asia/Jakarta";
  const stamp = new Intl.DateTimeFormat("id-ID", {
    timeZone: displayZone,
    dateStyle: "short",
    timeStyle: "medium",
  });
  const at = (iso: string | null) => (iso ? stamp.format(new Date(iso)) : "");

  const lines: unknown[][] = [
    ["Laporan Operasional Rakkita"],
    ["Outlet", outletLabel],
    ["Zona Waktu", timezone === "MIXED" ? `MIXED (ditampilkan dalam ${displayZone})` : timezone],
    ["Interval Mulai", at(from)],
    ["Interval Selesai", at(to)],
    ["Dibuat", at(new Date().toISOString())],
    [
      "Catatan",
      "Laporan operasional, bukan neraca atau laba akuntansi. Nilai order, uang diterima, dan piutang adalah ukuran yang berbeda dan tidak boleh dijumlahkan.",
    ],
    [],
    ["Bagian", "Waktu", "Outlet", "Nomor Order", "Pelanggan", "Rincian", "Metode", "Nominal (IDR)"],
    ...rows.map((r) => [
      SECTION_LABEL[r.section] ?? r.section,
      at(r.occurred_at),
      r.outlet_name,
      r.order_number,
      r.customer_name,
      r.detail,
      r.method,
      r.amount_idr,
    ]),
    [],
    // Subtotals come from the very rows printed above, so the file's own
    // summary always reconciles with its own drill-down (FR30).
    ["Ringkasan per Bagian", "Jumlah Baris", "Total (IDR)"],
    ...SECTION_ORDER.map((section) => {
      const inSection = rows.filter((r) => r.section === section);
      return [
        SECTION_LABEL[section],
        inSection.length,
        inSection.reduce((sum, r) => sum + Number(r.amount_idr), 0),
      ];
    }),
  ];

  const filename = safeFilename(`laporan-${outletLabel}-${from.slice(0, 10)}-${to.slice(0, 10)}.csv`);
  const body = csvDocument(lines);

  // FR36: the export is recorded before the file leaves the server.
  await reportRpc(supabase, "report_log_export", {
    p_tenant: tenant,
    p_outlet: outlet,
    p_from: from,
    p_to: to,
    p_row_count: rows.length,
    p_timezone: timezone,
    p_filename: filename,
    p_request_id: requestId,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "x-request-id": requestId,
    },
  });
});
