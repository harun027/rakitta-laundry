"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageBody, PageShell, Section, SectionHead, TopBar } from "@/components/ui/layout";
import { Select, type SelectOption } from "@/components/ui/select";
import { DataRow, Notice, StatTile } from "@/components/ui/stat";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatRupiah } from "@/lib/utils";

/* PRD FR30/FR31/FR36 — every number on this page comes from
 * report_financial() / report_audit_events(); the CSV comes from
 * /api/reports/export, which checks permission on the server. */

const ALL_OUTLETS = "all";

interface SectionTotal {
  total_idr: number;
  count: number;
}

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

interface FinancialReport {
  meta: {
    from: string;
    to: string;
    outlet_label: string;
    timezone: string;
    generated_at: string;
    row_count: number;
    truncated: boolean;
  };
  totals: Record<string, SectionTotal>;
  receipts_by_method: Record<string, number>;
  rows: ReportRow[];
}

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  outlet_name: string;
  payload: Record<string, unknown> | null;
  request_id: string | null;
}

interface EnvelopeError {
  code?: string;
  message: string;
  request_id?: string;
}

/* §9.5 — five separate measures. They are never added together. */
const SECTIONS = [
  {
    key: "ORDER_VALUE",
    label: "Nilai Order",
    hint: "Tagihan bersih dari order yang diterima pada interval ini. Bukan uang masuk.",
  },
  { key: "RECEIPT", label: "Uang Diterima", hint: "Kuitansi terkonfirmasi pada interval ini." },
  {
    key: "REFUND",
    label: "Refund Dibayarkan",
    hint: "Uang keluar ke pelanggan. Tidak dikurangkan dari kuitansi.",
  },
  { key: "EXPENSE", label: "Pengeluaran Kas", hint: "Belanja operasional dari laci kas." },
  {
    key: "RECEIVABLE",
    label: "Piutang",
    hint: "Sisa tagihan yang masih terbuka per akhir interval (cutoff historis).",
  },
] as const;

const RANGE_OPTIONS: SelectOption[] = [
  { value: "today", label: "Hari Ini", hint: "Sejak tengah malam sampai sekarang" },
  { value: "7d", label: "7 Hari Terakhir" },
  { value: "30d", label: "30 Hari Terakhir" },
  { value: "custom", label: "Rentang Kustom" },
];

function toDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function resolveInterval(preset: string, customFrom: string, customTo: string) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "custom") {
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return null;
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 0;
  const start = new Date(midnight);
  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: now.toISOString() };
}

function formatMoment(iso: string, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: timeZone && timeZone !== "MIXED" ? timeZone : undefined,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("id-ID");
  }
}

/** Condenses an audit payload into a couple of readable pairs (FR36 detail column). */
function summarizePayload(payload: Record<string, unknown> | null) {
  if (!payload) return "—";
  const pairs = Object.entries(payload)
    .filter(([, value]) => value !== null && typeof value !== "object")
    .slice(0, 4)
    .map(([key, value]) =>
      typeof value === "number" && /idr/i.test(key)
        ? `${key}: ${formatRupiah(value)}`
        : `${key}: ${String(value)}`
    );
  return pairs.length ? pairs.join(" · ") : "—";
}

export default function ReportsPage() {
  const { activeMembership, isLoading: authLoading } = useAuth();
  const tenantId = activeMembership?.tenant_id ?? null;
  const outlets = useMemo(() => activeMembership?.outlets ?? [], [activeMembership]);

  const [activeTab, setActiveTab] = useState<"finance" | "audit">("finance");
  const [outletId, setOutletId] = useState<string>(ALL_OUTLETS);
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date()));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<EnvelopeError | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const interval = useMemo(
    () => resolveInterval(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const scopeQuery = useMemo(() => {
    if (!tenantId || !interval) return null;
    const params = new URLSearchParams({ tenant: tenantId, from: interval.from, to: interval.to });
    if (outletId !== ALL_OUTLETS) params.set("outlet", outletId);
    return params.toString();
  }, [tenantId, interval, outletId]);

  const load = useCallback(async () => {
    if (!scopeQuery) return;
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === "finance") {
        setReport(await apiFetch<FinancialReport>(`/api/reports?${scopeQuery}`));
      } else {
        setAuditRows(await apiFetch<AuditRow[]>(`/api/reports/audit?${scopeQuery}&limit=200`));
      }
    } catch (err) {
      const envelope = err as EnvelopeError;
      setError({ code: envelope.code, message: envelope.message, request_id: envelope.request_id });
    } finally {
      setIsLoading(false);
    }
  }, [scopeQuery, activeTab]);

  useEffect(() => {
    if (authLoading) return;
    if (!scopeQuery) {
      setIsLoading(false);
      setError({
        code: "validation_failed",
        message: "Rentang tanggal tidak valid. Tanggal selesai harus setelah tanggal mulai.",
      });
      return;
    }
    load();
  }, [authLoading, scopeQuery, load]);

  /* FR31 — the browser only asks; the server decides whether this user may
   * export, builds the file, and records the audit entry. */
  const handleExport = async () => {
    if (!scopeQuery) return;
    setIsExporting(true);
    setExportNote(null);
    try {
      const response = await fetch(`/api/reports/export?${scopeQuery}`);
      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as EnvelopeError | null;
        setError({
          code: envelope?.code,
          message: envelope?.message ?? `Ekspor gagal (HTTP ${response.status}).`,
          request_id: envelope?.request_id,
        });
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "laporan.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportNote(`Berkas ${filename} sudah diunduh, dan ekspor ini tercatat di jejak audit.`);
    } catch {
      setError({ message: "Ekspor gagal dikirim. Periksa koneksi lalu coba lagi." });
    } finally {
      setIsExporting(false);
    }
  };

  const outletOptions: SelectOption[] = [
    { value: ALL_OUTLETS, label: "Semua Outlet", hint: `${outlets.length} outlet yang Anda akses` },
    ...outlets.map((outlet) => ({ value: outlet.id, label: outlet.name, hint: outlet.timezone })),
  ];

  const isForbidden = error?.code === "report_forbidden" || error?.code === "outlet_forbidden";

  return (
    <PageShell>
      <TopBar
        title="Laporan & Audit"
        subtitle="Laporan berbasis sumber, ekspor CSV, dan jejak audit"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading || !scopeQuery}>
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Muat Ulang
            </Button>
            <Button size="sm" onClick={handleExport} disabled={isExporting || !scopeQuery || isForbidden}>
              {isExporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Ekspor CSV
            </Button>
          </>
        }
      />

      <PageBody>
        {/* ---------------------------------------------------------- filter */}
        <Section>
          <Card pad="sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Outlet">
                <Select value={outletId} onValueChange={setOutletId} options={outletOptions} />
              </Field>
              <Field label="Rentang Waktu">
                <Select value={preset} onValueChange={setPreset} options={RANGE_OPTIONS} />
              </Field>
              {preset === "custom" && (
                <>
                  <Field label="Mulai">
                    <Input
                      type="date"
                      value={customFrom}
                      max={customTo}
                      onChange={(event) => setCustomFrom(event.target.value)}
                    />
                  </Field>
                  <Field label="Selesai">
                    <Input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      onChange={(event) => setCustomTo(event.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              variant={activeTab === "finance" ? "solid" : "outline"}
              size="sm"
              onClick={() => setActiveTab("finance")}
            >
              <FileSpreadsheet className="size-4" />
              Keuangan Operasional
            </Button>
            <Button
              variant={activeTab === "audit" ? "solid" : "outline"}
              size="sm"
              onClick={() => setActiveTab("audit")}
            >
              <History className="size-4" />
              Jejak Audit
            </Button>
          </div>

          {exportNote && (
            <Notice tone="success" icon={<ShieldCheck className="size-4" />}>
              <p>{exportNote}</p>
            </Notice>
          )}
        </Section>

        {/* -------------------------------------------- §8.3 required states */}
        {isForbidden ? (
          <Section>
            <Card pad="lg" className="space-y-4 text-center">
              <Lock className="mx-auto size-8 text-ink-faint" />
              <h2 className="text-xl font-extrabold tracking-tight">Akses Ditolak</h2>
              <p className="mx-auto max-w-md text-sm text-ink-muted">{error?.message}</p>
              {error?.request_id && <p className="eyebrow">ID Permintaan {error.request_id}</p>}
            </Card>
          </Section>
        ) : error ? (
          <Section>
            <Card pad="lg" className="space-y-4">
              <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                <p className="font-bold">Laporan gagal dimuat.</p>
                <p>{error.message}</p>
                {error.request_id && <p className="opacity-70">ID Permintaan: {error.request_id}</p>}
              </Notice>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="size-3.5" />
                Coba Lagi
              </Button>
            </Card>
          </Section>
        ) : isLoading ? (
          <Section>
            <Card pad="lg" className="flex items-center justify-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" />
              Memuat laporan…
            </Card>
          </Section>
        ) : activeTab === "finance" ? (
          <FinanceTab report={report} />
        ) : (
          <AuditTab rows={auditRows} />
        )}
      </PageBody>
    </PageShell>
  );
}

/* ------------------------------------------------------------- finance --- */

function FinanceTab({ report }: { report: FinancialReport | null }) {
  if (!report) return null;
  const { meta, totals, receipts_by_method: byMethod, rows } = report;

  return (
    <>
      <Section>
        <SectionHead
          eyebrow="FR30 · Laporan Berbasis Sumber"
          title="Ringkasan Interval"
          description={`${meta.outlet_label} · ${formatMoment(meta.from, meta.timezone)} sampai ${formatMoment(
            meta.to,
            meta.timezone
          )} · Zona waktu ${meta.timezone}`}
          size="sm"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <StatTile
              key={section.key}
              label={section.label}
              value={formatRupiah(totals[section.key]?.total_idr ?? 0)}
              hint={`${totals[section.key]?.count ?? 0} baris · ${section.hint}`}
              emphasis={
                section.key === "RECEIPT"
                  ? "positive"
                  : section.key === "REFUND" || section.key === "EXPENSE"
                    ? "negative"
                    : "default"
              }
            />
          ))}

          <Card pad="sm" tone="sunken" className="space-y-3">
            <span className="eyebrow block">Uang Diterima per Metode</span>
            {Object.keys(byMethod ?? {}).length === 0 ? (
              <p className="text-xs text-ink-muted">Belum ada penerimaan pada interval ini.</p>
            ) : (
              Object.entries(byMethod).map(([method, amount]) => (
                <DataRow key={method} label={method} value={formatRupiah(amount)} />
              ))
            )}
            <DataRow label="Total" value={formatRupiah(totals.RECEIPT?.total_idr ?? 0)} strong tone="positive" />
          </Card>
        </div>

        <Notice tone="info" icon={<ShieldCheck className="size-4" />}>
          <p className="font-bold">Ini laporan operasional, bukan neraca atau laba akuntansi.</p>
          <p>
            Nilai order, uang diterima, dan piutang adalah tiga ukuran berbeda dan tidak boleh dijumlahkan menjadi satu
            angka laba (PRD §9.5). Piutang dihitung per akhir interval, bukan per hari ini.
          </p>
        </Notice>
      </Section>

      {/* Drill-down: the very rows the totals above were aggregated from. */}
      <Section divided>
        <SectionHead
          eyebrow="Rincian"
          title="Drill-down per Sumber"
          description="Setiap baris berasal dari catatan aslinya. Jumlah rincian selalu sama dengan ringkasan di atas."
          size="sm"
        />

        {meta.truncated && (
          <Notice tone="warning" icon={<AlertCircle className="size-4" />}>
            <p>
              Interval ini berisi {meta.row_count} baris; hanya 500 pertama yang ditampilkan di layar. Ekspor CSV
              memuat seluruh baris.
            </p>
          </Notice>
        )}

        {rows.length === 0 ? (
          <Card pad="lg" className="text-center text-sm text-ink-muted">
            Tidak ada transaksi pada interval dan outlet ini.
          </Card>
        ) : (
          SECTIONS.map((section) => {
            const sectionRows = rows.filter((row) => row.section === section.key);
            if (sectionRows.length === 0) return null;
            const shown = sectionRows.reduce((sum, row) => sum + Number(row.amount_idr), 0);
            const summary = totals[section.key]?.total_idr ?? 0;
            const reconciles = shown === summary;

            return (
              <Card key={section.key} pad="none" className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">{section.label}</h3>
                    <p className="text-xs text-ink-muted">{section.hint}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={reconciles ? "success" : "warning"}>
                      {reconciles ? "Cocok dengan ringkasan" : "Sebagian ditampilkan"}
                    </Badge>
                    <span className="num text-base font-extrabold">{formatRupiah(summary)}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-sunken text-ink-muted">
                      <tr>
                        <th className="px-6 py-3 font-bold">Waktu</th>
                        <th className="px-6 py-3 font-bold">Outlet</th>
                        <th className="px-6 py-3 font-bold">Order</th>
                        <th className="px-6 py-3 font-bold">Pelanggan</th>
                        <th className="px-6 py-3 font-bold">Rincian</th>
                        <th className="px-6 py-3 text-right font-bold">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sectionRows.map((row, index) => (
                        <tr key={`${section.key}-${index}`} className="hover:bg-sunken/60">
                          <td className="px-6 py-3 text-ink-muted">
                            {formatMoment(row.occurred_at, meta.timezone)}
                          </td>
                          <td className="px-6 py-3 text-ink-muted">{row.outlet_name ?? "—"}</td>
                          <td className="num px-6 py-3 font-bold">{row.order_number ?? "—"}</td>
                          <td className="px-6 py-3">{row.customer_name ?? "—"}</td>
                          <td className="max-w-sm px-6 py-3 text-ink-muted">
                            {row.detail ?? "—"}
                            {row.method && <Badge className="ml-2">{row.method}</Badge>}
                          </td>
                          <td className="num px-6 py-3 text-right font-bold">{formatRupiah(row.amount_idr)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-line bg-sunken">
                      <tr>
                        <td className="px-6 py-3 font-bold" colSpan={5}>
                          Jumlah rincian yang ditampilkan
                        </td>
                        <td className="num px-6 py-3 text-right font-extrabold">{formatRupiah(shown)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            );
          })
        )}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- audit --- */

function AuditTab({ rows }: { rows: AuditRow[] | null }) {
  return (
    <Section>
      <SectionHead
        eyebrow="FR36 · Jejak Audit"
        title="Audit Trail"
        description="Dibaca langsung dari tabel audit_events yang append-only, termasuk setiap ekspor laporan."
        size="sm"
      />

      {!rows || rows.length === 0 ? (
        <Card pad="lg" className="text-center text-sm text-ink-muted">
          Belum ada aktivitas tercatat pada interval dan outlet ini.
        </Card>
      ) : (
        <Card pad="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-sunken text-ink-muted">
                <tr>
                  <th className="px-6 py-3 font-bold">Waktu</th>
                  <th className="px-6 py-3 font-bold">Aktor</th>
                  <th className="px-6 py-3 font-bold">Aksi</th>
                  <th className="px-6 py-3 font-bold">Entitas</th>
                  <th className="px-6 py-3 font-bold">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-sunken/60">
                    <td className="px-6 py-3 text-ink-muted">{formatMoment(row.occurred_at)}</td>
                    <td className="px-6 py-3">
                      <span className="font-bold">{row.actor_name}</span>
                      <span className="block text-ink-faint">{row.actor_role}</span>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={row.action === "REPORT_EXPORTED" ? "warning" : "muted"}>{row.action}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-bold">{row.entity}</span>
                      <span className="block text-ink-faint">{row.outlet_name}</span>
                    </td>
                    <td className="max-w-md px-6 py-3 text-ink-muted">{summarizePayload(row.payload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Notice tone="info" icon={<ShieldCheck className="size-4" />}>
        <p>
          Catatan audit tidak bisa diubah atau dihapus siapa pun, termasuk owner. Hanya owner dan supervisor yang boleh
          membacanya (PRD §10.1).
        </p>
      </Notice>
    </Section>
  );
}
