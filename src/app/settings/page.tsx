"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, FileText, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageBody, PageShell, Section, SectionHead, TopBar } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/field";
import { DataRow, Notice } from "@/components/ui/stat";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/supabase/auth-context";

/* =============================================================================
   Settings — printer profile (a per-browser preference, kept in localStorage
   like the layout skill allows) and the real subscription state (FR37, §19.2).
   A restricted plan never deletes data and never blocks finishing work that is
   already in progress; that promise is the whole point of showing this page.
   ============================================================================= */

type LoadState = "idle" | "loading" | "ready" | "error" | "forbidden";

const PAPER_SIZES = [
  { id: "58mm", label: "58 mm", hint: "Printer thermal portabel" },
  { id: "80mm", label: "80 mm", hint: "Printer thermal meja kasir" },
  { id: "a4", label: "A4", hint: "Faktur dokumen besar" },
] as const;

type PaperSize = (typeof PAPER_SIZES)[number]["id"];

interface Subscription {
  exists: boolean;
  plan: string;
  status: "ACTIVE" | "GRACE_PERIOD" | "RESTRICTED" | "CANCELLED";
  max_outlets: number;
  outlet_count: number;
  valid_until: string | null;
  days_remaining: number | null;
  blocks_new_orders: boolean;
}

const STATUS_LABEL: Record<Subscription["status"], string> = {
  ACTIVE: "Aktif",
  GRACE_PERIOD: "Masa Tenggang",
  RESTRICTED: "Dibatasi",
  CANCELLED: "Dibatalkan",
};

const STATUS_BADGE: Record<Subscription["status"], "success" | "warning" | "danger" | "muted"> = {
  ACTIVE: "success",
  GRACE_PERIOD: "warning",
  RESTRICTED: "danger",
  CANCELLED: "muted",
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isForbidden(error: unknown) {
  return (error as { status?: number } | null)?.status === 403;
}

export default function SettingsPage() {
  const { activeMembership, role, isLoading: authLoading } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const isOwner = role === "owner";

  const [paperSize, setPaperSize] = useState<PaperSize>("58mm");
  const [autoPrint, setAutoPrint] = useState(true);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subState, setSubState] = useState<LoadState>("idle");
  const [subError, setSubError] = useState("");

  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  // Printer preference is per-browser, not per-tenant data — localStorage is
  // the right shelf for it, with a safe fallback if it is unavailable.
  useEffect(() => {
    try {
      const savedSize = localStorage.getItem("rakkita.printer.size");
      const savedAuto = localStorage.getItem("rakkita.printer.autoPrint");
      if (savedSize === "58mm" || savedSize === "80mm" || savedSize === "a4") {
        setPaperSize(savedSize);
      }
      if (savedAuto !== null) setAutoPrint(savedAuto === "1");
    } catch {
      // private browsing or storage disabled — keep the defaults
    }
  }, []);

  const choosePaperSize = (size: PaperSize) => {
    setPaperSize(size);
    try {
      localStorage.setItem("rakkita.printer.size", size);
    } catch {
      // ignore — the choice still applies for this page view
    }
  };

  const toggleAutoPrint = (checked: boolean) => {
    setAutoPrint(checked);
    try {
      localStorage.setItem("rakkita.printer.autoPrint", checked ? "1" : "0");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!tenantId || !isOwner) return;
    let cancelled = false;
    setSubState("loading");
    apiFetch<Subscription>(`/api/admin/subscription?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((res) => {
        if (cancelled) return;
        setSubscription(res);
        setSubState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setSubError(messageOf(error, "Status langganan tidak dapat dimuat."));
        setSubState(isForbidden(error) ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, isOwner]);

  if (authLoading) {
    return (
      <PageShell>
        <TopBar title="Pengaturan" subtitle="Menyiapkan sesi…" />
        <PageBody width="content">
          <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" /> Memuat konteks pengguna…
          </Card>
        </PageBody>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <TopBar title="Pengaturan" subtitle="Printer, langganan, dan ekspor data" />

      <PageBody width="content">
        <Section>
          <SectionHead
            eyebrow="Printer"
            title="Profil Printer Struk Kasir"
            description="Mendukung printer thermal Bluetooth/USB standar kasir. Preferensi ini tersimpan di perangkat ini."
            size="sm"
          />

          <Card className="space-y-6">
            <div className="space-y-2">
              <span className="block text-xs font-bold text-ink-soft">Ukuran Kertas Thermal</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {PAPER_SIZES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePaperSize(p.id)}
                    aria-pressed={paperSize === p.id}
                    className={`min-h-[44px] rounded-control border p-4 text-left transition-colors ${
                      paperSize === p.id
                        ? "border-ink bg-ink text-white shadow-card"
                        : "border-line bg-surface text-ink hover:bg-sunken"
                    }`}
                  >
                    <div className="text-xs font-bold">{p.label}</div>
                    <div className={`text-[11px] ${paperSize === p.id ? "text-white/70" : "text-ink-muted"}`}>
                      {p.hint}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <Checkbox
                checked={autoPrint}
                onChange={(e) => toggleAutoPrint(e.target.checked)}
                label={
                  <span>
                    <span className="block text-sm font-bold text-ink">Buka Dialog Cetak Otomatis</span>
                    <span className="block text-xs text-ink-muted">
                      Panggil cetak otomatis saat kasir menekan Konfirmasi Order
                    </span>
                  </span>
                }
              />
            </div>

            <Button variant="outline" onClick={() => window.print()}>
              <FileText className="size-4" /> Uji Cetak Struk Contoh
            </Button>
          </Card>
        </Section>

        <Section divided>
          <SectionHead
            eyebrow="FR37"
            title="Paket Langganan Rakkita"
            description="Terpisah penuh dari rekening transaksi cucian pelanggan."
            size="sm"
          />

          {!isOwner && (
            <Notice tone="info" icon={<Lock className="size-4" />}>
              Hanya owner yang bisa melihat status langganan bisnis.
            </Notice>
          )}

          {isOwner && subState === "loading" && (
            <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Memuat status langganan…
            </Card>
          )}

          {isOwner && subState === "forbidden" && (
            <Notice tone="warning" icon={<Lock className="size-4" />}>
              {subError}
            </Notice>
          )}

          {isOwner && subState === "error" && (
            <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
              {subError}
            </Notice>
          )}

          {isOwner && subState === "ready" && subscription && (
            <Card className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="eyebrow block">Paket {subscription.plan}</span>
                  <p className="text-sm text-ink-muted">
                    {subscription.outlet_count} dari maksimal {subscription.max_outlets} outlet dipakai
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[subscription.status]}>
                  {STATUS_LABEL[subscription.status]}
                </Badge>
              </div>

              <div className="space-y-2 border-t border-line pt-4">
                <DataRow
                  label="Berlaku sampai"
                  value={
                    subscription.valid_until
                      ? new Date(subscription.valid_until).toLocaleDateString("id-ID")
                      : "—"
                  }
                />
                {subscription.days_remaining !== null && (
                  <DataRow
                    label="Sisa hari"
                    value={`${subscription.days_remaining} hari`}
                    tone={subscription.days_remaining <= 3 ? "warning" : "default"}
                  />
                )}
              </div>

              {subscription.blocks_new_orders ? (
                <Notice tone="warning">
                  <p className="font-bold">Order baru dibatasi</p>
                  <p>
                    Paket sedang dibatasi sehingga order baru tidak bisa dibuat. Data Anda tidak
                    dihapus: order yang sedang berjalan, pembayaran, dan pengambilan tetap bisa
                    diselesaikan seperti biasa. Hubungi owner untuk memperpanjang langganan.
                  </p>
                </Notice>
              ) : (
                <Notice tone="info">
                  Jika suatu saat paket masuk masa tenggang atau dibatasi, data tidak akan dihapus
                  dan order yang sedang berjalan tetap bisa diselesaikan.
                </Notice>
              )}
            </Card>
          )}

          <div className="flex flex-col items-start gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-muted">
              Anda bisa mengunduh seluruh data outlet kapan saja, termasuk saat paket dibatasi.
            </p>
            <Button
              variant="subtle"
              onClick={() =>
                setFeedback({
                  isOpen: true,
                  type: "info",
                  title: "Ekspor Data Belum Tersedia",
                  message:
                    "Fitur unduh arsip data lengkap sedang disiapkan. Hubungi dukungan untuk permintaan ekspor manual sementara ini.",
                })
              }
            >
              <Download className="size-4" /> Unduh Seluruh Data Saya
            </Button>
          </div>
        </Section>
      </PageBody>

      <FeedbackModal
        state={feedback}
        onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
      />
    </PageShell>
  );
}
