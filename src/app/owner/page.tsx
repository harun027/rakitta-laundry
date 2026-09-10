"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageBody, PageShell, Section, SectionHead, TopBar } from "@/components/ui/layout";
import { Select, type SelectOption } from "@/components/ui/select";
import { DataRow, Notice, StatTile } from "@/components/ui/stat";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatRupiah } from "@/lib/utils";

/* PRD §8.1 "Overview" — the four things an owner opens this page to check.
 * §5.5: "production overdue" and "ready, not collected" are different
 * problems, so they stay in separate blocks and separate counts. */

const ALL_OUTLETS = "all";

interface OverdueItem {
  id: string;
  order_number: string;
  customer_name: string;
  outlet_name: string;
  service_name: string;
  stage: string;
  due_at: string;
}

interface ReadyItem {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string | null;
  outlet_name: string;
  rack_code: string | null;
  ready_at: string | null;
}

interface ReceivableItem {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string | null;
  outlet_name: string;
  balance_idr: number;
  settlement_status: string;
  custody_state: string;
}

interface Overview {
  generated_at: string;
  production_overdue: { count: number; items: OverdueItem[] };
  ready_uncollected: { count: number; items: ReadyItem[] };
  receivables: { count: number; total_idr: number; items: ReceivableItem[] };
  cash_today: {
    received_idr: number;
    cash_idr: number;
    noncash_idr: number;
    refunds_idr: number;
    expenses_idr: number;
    open_sessions: number;
    timezone: string;
  };
}

interface EnvelopeError {
  code?: string;
  message: string;
  request_id?: string;
}

function formatMoment(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Human lateness, always with a word — colour alone must not carry meaning (§10 charts). */
function lateness(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `Terlambat ${Math.max(minutes, 1)} menit`;
  if (minutes < 1440) return `Terlambat ${Math.floor(minutes / 60)} jam`;
  return `Terlambat ${Math.floor(minutes / 1440)} hari`;
}

function waiting(iso: string | null) {
  if (!iso) return "Menunggu diambil";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Siap hari ini";
  return `Menunggu ${days} hari`;
}

export default function OwnerOverviewPage() {
  const { activeMembership, isLoading: authLoading } = useAuth();
  const tenantId = activeMembership?.tenant_id ?? null;
  const outlets = useMemo(() => activeMembership?.outlets ?? [], [activeMembership]);

  const [outletId, setOutletId] = useState<string>(ALL_OUTLETS);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<EnvelopeError | null>(null);

  const query = useMemo(() => {
    if (!tenantId) return null;
    const params = new URLSearchParams({ tenant: tenantId });
    if (outletId !== ALL_OUTLETS) params.set("outlet", outletId);
    return params.toString();
  }, [tenantId, outletId]);

  const load = useCallback(async () => {
    if (!query) return;
    setIsLoading(true);
    setError(null);
    try {
      setOverview(await apiFetch<Overview>(`/api/reports/overview?${query}`));
    } catch (err) {
      const envelope = err as EnvelopeError;
      setError({ code: envelope.code, message: envelope.message, request_id: envelope.request_id });
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const outletOptions: SelectOption[] = [
    { value: ALL_OUTLETS, label: "Semua Outlet", hint: `${outlets.length} outlet yang Anda akses` },
    ...outlets.map((outlet) => ({ value: outlet.id, label: outlet.name, hint: outlet.timezone })),
  ];

  const isForbidden = error?.code === "report_forbidden" || error?.code === "outlet_forbidden";
  const cash = overview?.cash_today;

  return (
    <PageShell>
      <TopBar
        title="Ikhtisar Owner"
        subtitle="Keterlambatan, siap diambil, piutang, dan kas hari ini"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading || !query}>
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
        }
      />

      <PageBody>
        <Section>
          <Card pad="sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Outlet">
                <Select value={outletId} onValueChange={setOutletId} options={outletOptions} />
              </Field>
              <div className="flex items-end">
                <p className="text-xs leading-relaxed text-ink-muted">
                  {overview
                    ? `Data per ${formatMoment(overview.generated_at)} · Kas dihitung menurut hari kalender outlet (${cash?.timezone}).`
                    : "Angka diambil langsung dari catatan order, kuitansi, refund, dan pengeluaran."}
                </p>
              </div>
            </div>
          </Card>
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
                <p className="font-bold">Ikhtisar gagal dimuat.</p>
                <p>{error.message}</p>
                {error.request_id && <p className="opacity-70">ID Permintaan: {error.request_id}</p>}
              </Notice>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="size-3.5" />
                Coba Lagi
              </Button>
            </Card>
          </Section>
        ) : isLoading || !overview ? (
          <Section>
            <Card pad="lg" className="flex items-center justify-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" />
              Memuat ikhtisar…
            </Card>
          </Section>
        ) : (
          <>
            {/* ------------------------------------------------------- KPI */}
            <Section>
              <SectionHead
                eyebrow="Ikhtisar"
                title="Empat Angka Utama"
                description="Keterlambatan produksi dan cucian siap-tapi-belum-diambil sengaja dipisah: keduanya masalah berbeda (PRD §5.5)."
                size="sm"
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  label="Uang Diterima Hari Ini"
                  value={formatRupiah(cash?.received_idr ?? 0)}
                  hint={`Kas ${formatRupiah(cash?.cash_idr ?? 0)} · Non-kas ${formatRupiah(cash?.noncash_idr ?? 0)}`}
                  emphasis="positive"
                />
                <StatTile
                  label="Piutang Aktif"
                  value={formatRupiah(overview.receivables.total_idr)}
                  hint={`${overview.receivables.count} order belum lunas`}
                />
                <StatTile
                  label="Produksi Terlambat"
                  value={`${overview.production_overdue.count} pekerjaan`}
                  hint="Masih dikerjakan dan sudah melewati tenggat sendiri"
                  emphasis="negative"
                />
                <StatTile
                  label="Siap, Belum Diambil"
                  value={`${overview.ready_uncollected.count} order`}
                  hint="Produksi selesai, barang masih di rak outlet"
                />
              </div>

              <Card pad="sm" tone="sunken" className="space-y-2">
                <span className="eyebrow block">Kas Hari Ini ({cash?.timezone})</span>
                <DataRow label="Uang diterima" value={formatRupiah(cash?.received_idr ?? 0)} tone="positive" />
                <DataRow label="— tunai" value={formatRupiah(cash?.cash_idr ?? 0)} />
                <DataRow label="— transfer / QRIS" value={formatRupiah(cash?.noncash_idr ?? 0)} />
                <DataRow label="Refund dibayarkan" value={formatRupiah(cash?.refunds_idr ?? 0)} tone="negative" />
                <DataRow label="Pengeluaran kas" value={formatRupiah(cash?.expenses_idr ?? 0)} tone="negative" />
                <DataRow label="Sesi laci kas terbuka" value={`${cash?.open_sessions ?? 0} sesi`} strong />
              </Card>

              <Notice tone="info">
                <p>
                  Angka di atas adalah ukuran operasional yang berbeda-beda. Nilai order, uang diterima, dan piutang
                  tidak boleh dijumlahkan menjadi satu angka laba (PRD §9.5).
                </p>
              </Notice>
            </Section>

            {/* --------------------------------------------------- watchlists */}
            <Section divided>
              <SectionHead eyebrow="Perlu Tindakan" title="Daftar Pantau" size="sm" />

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-5 text-danger" />
                      <h3 className="text-base font-bold tracking-tight">Produksi Terlambat</h3>
                    </div>
                    <Link
                      href="/production"
                      className="flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
                    >
                      Papan Produksi <ChevronRight className="size-4" />
                    </Link>
                  </div>

                  {overview.production_overdue.items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-muted">
                      Tidak ada pekerjaan yang melewati tenggat. Antrean aman.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {overview.production_overdue.items.map((item) => (
                        <li key={item.id} className="space-y-1 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num text-sm font-bold">{item.order_number}</span>
                            <Badge variant="danger">{lateness(item.due_at)}</Badge>
                            <Badge variant="outline">{item.stage}</Badge>
                          </div>
                          <p className="text-sm text-ink-soft">
                            {item.customer_name} · {item.service_name}
                          </p>
                          <p className="text-xs text-ink-faint">
                            {item.outlet_name} · Tenggat {formatMoment(item.due_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {overview.production_overdue.count > overview.production_overdue.items.length && (
                    <p className="text-xs text-ink-muted">
                      Menampilkan {overview.production_overdue.items.length} dari {overview.production_overdue.count}{" "}
                      pekerjaan terlambat.
                    </p>
                  )}
                </Card>

                <Card className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="size-5 text-ok" />
                      <h3 className="text-base font-bold tracking-tight">Siap, Belum Diambil</h3>
                    </div>
                    <Link
                      href="/cashier/orders"
                      className="flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
                    >
                      Serah Terima <ChevronRight className="size-4" />
                    </Link>
                  </div>

                  {overview.ready_uncollected.items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-muted">
                      Tidak ada cucian selesai yang menunggu diambil.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {overview.ready_uncollected.items.map((item) => (
                        <li key={item.id} className="space-y-1 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num text-sm font-bold">{item.order_number}</span>
                            <Badge variant="muted">
                              <Clock className="size-3" />
                              {waiting(item.ready_at)}
                            </Badge>
                          </div>
                          <p className="text-sm text-ink-soft">
                            {item.customer_name}
                            {item.phone ? ` · ${item.phone}` : ""}
                          </p>
                          <p className="text-xs text-ink-faint">
                            {item.outlet_name} · {item.rack_code ? `Rak ${item.rack_code}` : "Rak belum dicatat"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {overview.ready_uncollected.count > overview.ready_uncollected.items.length && (
                    <p className="text-xs text-ink-muted">
                      Menampilkan {overview.ready_uncollected.items.length} dari {overview.ready_uncollected.count}{" "}
                      order.
                    </p>
                  )}
                </Card>
              </div>

              <Card className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-5 text-warn" />
                    <h3 className="text-base font-bold tracking-tight">Piutang Pelanggan</h3>
                  </div>
                  <Link
                    href="/reports"
                    className="flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
                  >
                    Laporan & Ekspor <ChevronRight className="size-4" />
                  </Link>
                </div>

                {overview.receivables.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-muted">Semua order sudah lunas.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.receivables.items.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num text-sm font-bold">{item.order_number}</span>
                            <Badge variant={item.custody_state === "HANDED_OVER" ? "warning" : "outline"}>
                              {item.custody_state === "HANDED_OVER" ? "Sudah diserahkan" : "Masih di outlet"}
                            </Badge>
                            <Badge variant="muted">{item.settlement_status}</Badge>
                          </div>
                          <p className="text-sm text-ink-soft">
                            {item.customer_name}
                            {item.phone ? ` · ${item.phone}` : ""}
                          </p>
                          <p className="text-xs text-ink-faint">{item.outlet_name}</p>
                        </div>
                        <span className="num text-base font-extrabold text-warn">
                          {formatRupiah(item.balance_idr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {overview.receivables.count > overview.receivables.items.length && (
                  <p className="text-xs text-ink-muted">
                    Menampilkan {overview.receivables.items.length} piutang terbesar dari {overview.receivables.count}{" "}
                    order. Rincian lengkap ada di halaman Laporan.
                  </p>
                )}
              </Card>
            </Section>
          </>
        )}
      </PageBody>
    </PageShell>
  );
}
