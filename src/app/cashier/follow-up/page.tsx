"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageBody, PageShell, Section, TopBar } from "@/components/ui/layout";
import { Notice, StatTile } from "@/components/ui/stat";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";
import {
  buildUncollectedReminderWhatsAppMessage,
  generateWhatsAppUrl,
} from "@/lib/domain/whatsapp";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatRupiah } from "@/lib/utils";

/* =============================================================================
   FR35 — follow-up queue: orders ready but not collected, and orders with an
   outstanding balance. §5.5: "ready" age is measured from current_ready_at,
   default threshold 3 calendar days, configurable per outlet in Administrasi.
   §6.1: a manual WhatsApp click only ever reaches PREPARED / OPENED_IN_WHATSAPP
   — never "delivered" or "read". Opening the link schedules nothing further.
   ============================================================================= */

type LoadState = "idle" | "loading" | "ready" | "error" | "forbidden";

interface FollowUpItem {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  service_summary: string | null;
  balance_idr: number;
  rack_code?: string | null;
  current_ready_at?: string;
  days_ready?: number;
  is_due?: boolean;
  accepted_at?: string;
  last_prepared_at: string | null;
  last_message_status: "PREPARED" | "OPENED_IN_WHATSAPP" | "FAILED" | null;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isForbidden(error: unknown) {
  return (error as { status?: number } | null)?.status === 403;
}

export default function FollowUpPage() {
  const { activeOutlet, isLoading: authLoading } = useAuth();
  const outletId = activeOutlet?.id;

  const [ready, setReady] = useState<FollowUpItem[]>([]);
  const [outstanding, setOutstanding] = useState<FollowUpItem[]>([]);
  const [thresholdDays, setThresholdDays] = useState(3);
  const [tab, setTab] = useState<"ready" | "outstanding">("ready");
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  // §13.3 — one key per order per attempt, reused if the log call is retried.
  const sendKeysRef = useRef<Map<string, string>>(new Map());
  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const load = useCallback(async () => {
    if (!outletId) return;
    setState("loading");
    try {
      const res = await apiFetch<{
        threshold_days: number;
        ready_uncollected: FollowUpItem[];
        outstanding: FollowUpItem[];
      }>(`/api/admin/follow-ups?outlet_id=${encodeURIComponent(outletId)}`);
      setThresholdDays(res.threshold_days ?? 3);
      setReady(res.ready_uncollected ?? []);
      setOutstanding(res.outstanding ?? []);
      setState("ready");
    } catch (error) {
      setErrorMessage(messageOf(error, "Antrean tindak lanjut tidak dapat dimuat."));
      setState(isForbidden(error) ? "forbidden" : "error");
    }
  }, [outletId]);

  useEffect(() => {
    load();
  }, [load]);

  const sendReminder = async (item: FollowUpItem) => {
    if (sendingId) return;
    const daysReady = item.days_ready ?? 0;
    const text = buildUncollectedReminderWhatsAppMessage(
      {
        orderNumber: item.order_number,
        customerName: item.customer_name,
        customerPhone: item.customer_phone,
        outletName: activeOutlet?.name ?? "Rakkita",
        serviceSummary: item.service_summary ?? "Layanan cuci",
        balanceIdr: item.balance_idr,
      },
      daysReady
    );

    if (!item.customer_phone) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Nomor WhatsApp Tidak Tersedia",
        message: "Pelanggan ini belum memiliki nomor WhatsApp yang tercatat.",
      });
      return;
    }

    setSendingId(item.order_id);
    try {
      // PRD §6.1 — the click only ever produces PREPARED/OPENED_IN_WHATSAPP,
      // and reading this queue never schedules an automatic reminder (FR35).
      window.open(generateWhatsAppUrl(item.customer_phone, text), "_blank");
      let key = sendKeysRef.current.get(item.order_id);
      if (!key) {
        key = crypto.randomUUID();
        sendKeysRef.current.set(item.order_id, key);
      }
      await apiFetch(`/api/orders/${item.order_id}/whatsapp`, {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify({
          recipient_phone: item.customer_phone,
          message_preview: text.slice(0, 200),
        }),
      });
      sendKeysRef.current.delete(item.order_id);
      await load();
    } catch (error) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Catatan Pengingat Gagal Disimpan",
        message: messageOf(
          error,
          "WhatsApp mungkin sudah terbuka, tetapi catatan riwayat gagal disimpan."
        ),
      });
    } finally {
      setSendingId(null);
    }
  };

  const list = tab === "ready" ? ready : outstanding;
  const dueCount = ready.filter((r) => r.is_due).length;

  if (authLoading) {
    return (
      <PageShell>
        <TopBar title="Antrean Tindak Lanjut" subtitle="Menyiapkan sesi…" />
        <PageBody>
          <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" /> Memuat konteks pengguna…
          </Card>
        </PageBody>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <TopBar
        title="Antrean Tindak Lanjut"
        subtitle={activeOutlet ? `${activeOutlet.name} · Pengingat WhatsApp manual` : "Outlet belum dipilih"}
        actions={
          <Button variant="outline" onClick={load} disabled={state === "loading"}>
            <RefreshCw className={`size-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
        }
      />

      <PageBody>
        <Notice tone="info" icon={<Send className="size-4" />}>
          <p className="font-bold">Pengiriman manual</p>
          <p>
            Klik ini hanya membuka WhatsApp dengan pesan siap kirim. Sistem tidak menjadwalkan
            pengingat otomatis, dan status pesan hanya tercatat sebagai &ldquo;disiapkan&rdquo; atau
            &ldquo;dibuka di WhatsApp&rdquo; — bukan &ldquo;terkirim&rdquo; atau &ldquo;dibaca&rdquo;.
          </p>
        </Notice>

        {state === "ready" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Siap, Belum Diambil"
              value={ready.length}
              hint={`Ambang ${thresholdDays} hari kalender sejak siap`}
            />
            <StatTile
              label="Sudah Melewati Ambang"
              value={dueCount}
              hint="Prioritas dihubungi lebih dulu"
              emphasis={dueCount > 0 ? "negative" : "default"}
            />
            <StatTile
              label="Punya Sisa Tagihan"
              value={outstanding.length}
              hint="Order aktif dengan saldo belum lunas"
            />
          </div>
        )}

        <nav className="flex gap-2.5 border-b border-line pb-3" aria-label="Bagian tindak lanjut">
          <button
            type="button"
            onClick={() => setTab("ready")}
            aria-current={tab === "ready" ? "page" : undefined}
            className={`press-fx flex h-11 items-center gap-2 rounded-full px-5 text-xs font-bold transition-colors ${
              tab === "ready"
                ? "bg-ink text-white shadow-card"
                : "border border-line text-ink-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            <Clock className="size-4" /> Siap Belum Diambil ({ready.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("outstanding")}
            aria-current={tab === "outstanding" ? "page" : undefined}
            className={`press-fx flex h-11 items-center gap-2 rounded-full px-5 text-xs font-bold transition-colors ${
              tab === "outstanding"
                ? "bg-ink text-white shadow-card"
                : "border border-line text-ink-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            <Wallet className="size-4" /> Punya Piutang ({outstanding.length})
          </button>
        </nav>

        <Section>
          {state === "loading" && (
            <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Memuat antrean…
            </Card>
          )}
          {state === "forbidden" && (
            <Notice tone="warning" icon={<Lock className="size-4" />}>
              <p className="font-bold">Akses ditolak</p>
              <p>{errorMessage}</p>
            </Notice>
          )}
          {state === "error" && (
            <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
              <p className="font-bold">Gagal memuat</p>
              <p>{errorMessage}</p>
              <button type="button" onClick={load} className="mt-1 font-bold underline">
                Coba lagi
              </button>
            </Notice>
          )}
          {state === "ready" && list.length === 0 && (
            <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
              <CheckCircle2 className="size-4 text-ok" />
              {tab === "ready"
                ? "Tidak ada cucian siap yang mengendap."
                : "Tidak ada order dengan piutang."}
            </Card>
          )}
          {state === "ready" && list.length > 0 && (
            <div className="grid gap-4">
              {list.map((item) => (
                <Card key={item.order_id} pad="sm" className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-bold text-ink">{item.order_number}</span>
                      {tab === "ready" && (
                        <Badge variant={item.is_due ? "danger" : "outline"}>
                          {item.days_ready ?? 0} hari di rak
                          {item.rack_code ? ` (${item.rack_code})` : ""}
                        </Badge>
                      )}
                      {item.last_message_status && (
                        <Badge variant="muted">
                          {item.last_message_status === "OPENED_IN_WHATSAPP"
                            ? "Sudah dibuka di WhatsApp"
                            : "Pesan disiapkan"}
                        </Badge>
                      )}
                    </div>
                    <p className="font-bold">
                      {item.customer_name}
                      {item.customer_phone && (
                        <span className="num font-normal text-ink-muted"> ({item.customer_phone})</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {item.service_summary ?? "Layanan cuci"} · Sisa Tagihan:{" "}
                      <strong className={item.balance_idr > 0 ? "text-warn" : "text-ok"}>
                        {item.balance_idr === 0 ? "LUNAS" : formatRupiah(item.balance_idr)}
                      </strong>
                    </p>
                  </div>

                  <Button
                    onClick={() => sendReminder(item)}
                    disabled={sendingId === item.order_id || !item.customer_phone}
                    className="shrink-0"
                  >
                    {sendingId === item.order_id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {sendingId === item.order_id ? "Membuka…" : "Buka WhatsApp"}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </PageBody>

      <FeedbackModal
        state={feedback}
        onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
      />
    </PageShell>
  );
}
