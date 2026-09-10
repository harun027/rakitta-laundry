"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  Clock,
  Copy,
  FileCheck,
  History,
  Loader2,
  Lock,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Shirt,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, SearchInput } from "@/components/ui/field";
import { PageBody, PageShell, Section, SectionHead, TopBar } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { DataRow, Notice, StatTile } from "@/components/ui/stat";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatRupiah } from "@/lib/utils";

/* =============================================================================
   FR02 staff invitations · FR04 services & prices · FR05/FR07 customers ·
   outlet policies (§5.5 configurable ready/uncollected threshold).

   Every write goes to a Route Handler, which calls a SECURITY DEFINER command;
   the browser never touches a table. Price changes publish a NEW service
   version (§12.1), so receipts printed yesterday keep yesterday's price.
   ============================================================================= */

type Tab = "customers" | "services" | "staff" | "outlets" | "policies";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "customers", label: "Pelanggan", icon: Users },
  { id: "services", label: "Layanan & Harga", icon: Shirt },
  { id: "staff", label: "Staf & Hak Akses", icon: ShieldCheck },
  { id: "outlets", label: "Outlet", icon: Building2 },
  { id: "policies", label: "Kebijakan Outlet", icon: FileCheck },
];

const UNIT_OPTIONS: SelectOption[] = [
  { value: "kg", label: "Kilogram (kg)", hint: "Ditimbang, memakai minimum dan kelipatan" },
  { value: "piece", label: "Satuan (pcs)", hint: "Dihitung per potong, tanpa timbangan" },
];

const ROLE_OPTIONS: SelectOption[] = [
  { value: "cashier", label: "Kasir", hint: "Input order, terima pembayaran, serah terima" },
  { value: "operator", label: "Operator Produksi", hint: "Antrean mesin, QC, penataan rak" },
  { value: "supervisor", label: "Supervisor", hint: "Persetujuan, revisi harga, tutup laci kas" },
];

const WORKFLOW_OPTIONS: SelectOption[] = [
  { value: "wash_iron", label: "Cuci → Kering → Setrika → QC" },
  { value: "iron_only", label: "Setrika saja → QC" },
  { value: "wash_only", label: "Cuci → Kering → QC" },
];

const WORKFLOWS: Record<string, string[]> = {
  wash_iron: ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"],
  iron_only: ["QUEUED", "IRONING", "QC", "READY"],
  wash_only: ["QUEUED", "WASHING", "DRYING", "QC", "READY"],
};

function workflowKey(steps: string[] | undefined): string {
  const joined = (steps ?? []).join(",");
  const found = Object.entries(WORKFLOWS).find(([, v]) => v.join(",") === joined);
  return found ? found[0] : "wash_iron";
}

interface ServiceRow {
  service_id: string;
  name: string;
  unit: "kg" | "piece";
  is_active: boolean;
  current_version_id: string | null;
  price_per_unit_idr: number;
  min_grams: number;
  increment_grams: number;
  sla_hours: number;
  workflow_steps: string[];
  version_since: string | null;
  version_count: number;
  orders_on_current_version: number;
}

interface StaffMember {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  is_self: boolean;
  all_outlets: boolean;
  outlets: { id: string; name: string; code: string }[];
}

interface StaffInvitation {
  invitation_id: string;
  email: string;
  full_name: string;
  role: string;
  status: "PENDING" | "REVOKED" | "EXPIRED";
  expires_at: string;
  outlets: { id: string; name: string; code: string }[];
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  orders_count: number;
  total_spent_idr: number | null;
  last_order_at: string | null;
}

type LoadState = "idle" | "loading" | "ready" | "error" | "forbidden";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isForbidden(error: unknown) {
  return (error as { status?: number } | null)?.status === 403;
}

/** A block that says why nothing is on screen, in the same shape every time. */
function StateBlock({
  state,
  message,
  empty,
  onRetry,
}: {
  state: LoadState;
  message: string;
  empty: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <Card tone="sunken" className="flex items-center gap-3 text-sm text-ink-muted">
        <Loader2 className="size-4 animate-spin" /> Memuat data…
      </Card>
    );
  }
  if (state === "forbidden") {
    return (
      <Notice tone="warning" icon={<Lock className="size-4" />}>
        <p className="font-bold">Akses ditolak</p>
        <p>{message}</p>
      </Notice>
    );
  }
  if (state === "error") {
    return (
      <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
        <p className="font-bold">Gagal memuat</p>
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-1 font-bold underline">
            Coba lagi
          </button>
        )}
      </Notice>
    );
  }
  return (
    <Card tone="sunken" className="text-center text-sm text-ink-muted">
      {empty}
    </Card>
  );
}

export default function AdminPage() {
  const { activeOutlet, activeMembership, role, isLoading: authLoading } = useAuth();
  const outletId = activeOutlet?.id;
  const tenantId = activeMembership?.tenant_id;
  const canManageCatalog = role === "owner" || role === "supervisor";
  const canManageStaff = role === "owner";

  const [activeTab, setActiveTab] = useState<Tab>("services");
  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  /* ------------------------------------------------------------- services -- */
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [servicesState, setServicesState] = useState<LoadState>("idle");
  const [servicesError, setServicesError] = useState("");

  const loadServices = useCallback(async () => {
    if (!outletId) return;
    setServicesState("loading");
    try {
      const res = await apiFetch<{ services: ServiceRow[] }>(
        `/api/services?outlet_id=${encodeURIComponent(outletId)}`
      );
      setServices(res.services ?? []);
      setServicesState("ready");
    } catch (error) {
      setServicesError(messageOf(error, "Katalog layanan tidak dapat dimuat."));
      setServicesState(isForbidden(error) ? "forbidden" : "error");
    }
  }, [outletId]);

  /* ---------------------------------------------------------------- staff -- */
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [staffState, setStaffState] = useState<LoadState>("idle");
  const [staffError, setStaffError] = useState("");

  const loadStaff = useCallback(async () => {
    if (!tenantId) return;
    setStaffState("loading");
    try {
      const res = await apiFetch<{ members: StaffMember[]; invitations: StaffInvitation[] }>(
        `/api/staff?tenant_id=${encodeURIComponent(tenantId)}`
      );
      setMembers(res.members ?? []);
      setInvitations(res.invitations ?? []);
      setStaffState("ready");
    } catch (error) {
      setStaffError(messageOf(error, "Daftar staf tidak dapat dimuat."));
      setStaffState(isForbidden(error) ? "forbidden" : "error");
    }
  }, [tenantId]);

  /* ------------------------------------------------------------ customers -- */
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersState, setCustomersState] = useState<LoadState>("idle");
  const [customersError, setCustomersError] = useState("");

  useEffect(() => {
    // FR07 — search needs input; an empty box never dumps the directory.
    const query = customerQuery.trim();
    if (!outletId || query.length < 2) {
      setCustomers([]);
      setCustomersState("idle");
      return;
    }
    let cancelled = false;
    setCustomersState("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ customers: CustomerRow[] }>(
          `/api/admin/customers?outlet_id=${encodeURIComponent(outletId)}&q=${encodeURIComponent(query)}`
        );
        if (cancelled) return;
        setCustomers(res.customers ?? []);
        setCustomersState("ready");
      } catch (error) {
        if (cancelled) return;
        setCustomersError(messageOf(error, "Pencarian pelanggan gagal."));
        setCustomersState(isForbidden(error) ? "forbidden" : "error");
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery, outletId]);

  /* ------------------------------------------------------------- policies -- */
  const [policies, setPolicies] = useState({
    uncollected_threshold_days: 3,
    max_credit_limit_idr: 100000,
    compensation_policy: "",
  });
  const [policiesState, setPoliciesState] = useState<LoadState>("idle");
  const [policiesError, setPoliciesError] = useState("");
  const [savingPolicies, setSavingPolicies] = useState(false);
  const policyKeyRef = useRef<string | null>(null);

  const loadPolicies = useCallback(async () => {
    if (!outletId) return;
    setPoliciesState("loading");
    try {
      const res = await apiFetch<typeof policies>(
        `/api/admin/outlet-settings?outlet_id=${encodeURIComponent(outletId)}`
      );
      setPolicies({
        uncollected_threshold_days: res.uncollected_threshold_days ?? 3,
        max_credit_limit_idr: res.max_credit_limit_idr ?? 100000,
        compensation_policy: res.compensation_policy ?? "",
      });
      setPoliciesState("ready");
    } catch (error) {
      setPoliciesError(messageOf(error, "Kebijakan outlet tidak dapat dimuat."));
      setPoliciesState(isForbidden(error) ? "forbidden" : "error");
    }
  }, [outletId]);

  useEffect(() => {
    if (activeTab === "services") loadServices();
    if (activeTab === "staff") loadStaff();
    if (activeTab === "policies") loadPolicies();
  }, [activeTab, loadServices, loadStaff, loadPolicies]);

  const savePolicies = async () => {
    if (!outletId || savingPolicies) return;
    // §13.3 — one key per user action, reused if the same click is retried.
    policyKeyRef.current ??= crypto.randomUUID();
    setSavingPolicies(true);
    try {
      await apiFetch("/api/admin/outlet-settings", {
        method: "POST",
        idempotencyKey: policyKeyRef.current,
        body: JSON.stringify({ outlet_id: outletId, ...policies }),
      });
      policyKeyRef.current = null;
      setFeedback({
        isOpen: true,
        type: "success",
        title: "Kebijakan Outlet Tersimpan",
        message:
          "Ambang cucian mengendap dan batas kredit yang baru langsung dipakai antrean tindak lanjut.",
      });
    } catch (error) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Kebijakan Gagal Disimpan",
        message: messageOf(error, "Coba lagi sebentar lagi."),
      });
    } finally {
      setSavingPolicies(false);
    }
  };

  /* ------------------------------------------------------- service editor -- */
  const [serviceForm, setServiceForm] = useState<{
    open: boolean;
    editing: ServiceRow | null;
    name: string;
    unit: string;
    price: string;
    minGrams: string;
    incrementGrams: string;
    slaHours: string;
    workflow: string;
    isActive: boolean;
  } | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const serviceKeyRef = useRef<string | null>(null);
  const toggleKeysRef = useRef<Map<string, string>>(new Map());
  const revokeKeysRef = useRef<Map<string, string>>(new Map());

  const openServiceForm = (row: ServiceRow | null) => {
    serviceKeyRef.current = null;
    setServiceError("");
    setServiceForm({
      open: true,
      editing: row,
      name: row?.name ?? "",
      unit: row?.unit ?? "kg",
      price: String(row?.price_per_unit_idr ?? 0),
      minGrams: String(row?.min_grams ?? 3000),
      incrementGrams: String(row?.increment_grams ?? 100),
      slaHours: String(row?.sla_hours ?? 48),
      workflow: workflowKey(row?.workflow_steps),
      isActive: row ? row.is_active : true,
    });
  };

  const submitService = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceForm || !outletId || savingService) return;
    serviceKeyRef.current ??= crypto.randomUUID();
    setSavingService(true);
    setServiceError("");
    try {
      await apiFetch("/api/services", {
        method: "POST",
        idempotencyKey: serviceKeyRef.current,
        body: JSON.stringify({
          outlet_id: outletId,
          service_id: serviceForm.editing?.service_id ?? null,
          name: serviceForm.name.trim(),
          unit: serviceForm.unit,
          price_per_unit_idr: Number(serviceForm.price) || 0,
          min_grams: serviceForm.unit === "kg" ? Number(serviceForm.minGrams) || 0 : 0,
          increment_grams: serviceForm.unit === "kg" ? Number(serviceForm.incrementGrams) || 100 : 1,
          sla_hours: Number(serviceForm.slaHours) || 48,
          workflow_steps: WORKFLOWS[serviceForm.workflow],
          is_active: serviceForm.isActive,
        }),
      });
      serviceKeyRef.current = null;
      setServiceForm(null);
      await loadServices();
      setFeedback({
        isOpen: true,
        type: "success",
        title: "Versi Layanan Diterbitkan",
        message:
          "Perubahan tersimpan sebagai versi baru. Order dan struk lama tetap memakai versi harga saat order dibuat.",
      });
    } catch (error) {
      setServiceError(messageOf(error, "Layanan gagal disimpan."));
    } finally {
      setSavingService(false);
    }
  };

  const toggleServiceActive = async (row: ServiceRow) => {
    if (!outletId) return;
    // §13.3 — one key per service per attempt, reused if this click is retried.
    let key = toggleKeysRef.current.get(row.service_id);
    if (!key) {
      key = crypto.randomUUID();
      toggleKeysRef.current.set(row.service_id, key);
    }
    try {
      await apiFetch("/api/services", {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify({
          outlet_id: outletId,
          service_id: row.service_id,
          name: row.name,
          unit: row.unit,
          price_per_unit_idr: row.price_per_unit_idr,
          min_grams: row.min_grams,
          increment_grams: row.increment_grams,
          sla_hours: row.sla_hours,
          workflow_steps: row.workflow_steps,
          is_active: !row.is_active,
        }),
      });
      toggleKeysRef.current.delete(row.service_id);
      await loadServices();
      setFeedback({
        isOpen: true,
        type: "success",
        title: row.is_active ? "Layanan Diarsipkan" : "Layanan Diaktifkan Kembali",
        message: row.is_active
          ? "Layanan tidak lagi bisa dipilih kasir, tetapi tetap muncul di struk dan order lama."
          : "Layanan kembali tersedia di POS kasir dengan versi harga terbaru.",
      });
    } catch (error) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Perubahan Gagal",
        message: messageOf(error, "Status layanan tidak berubah."),
      });
    }
  };

  /* -------------------------------------------------------- invite editor -- */
  const [inviteForm, setInviteForm] = useState({
    open: false,
    fullName: "",
    email: "",
    role: "cashier",
    outletIds: [] as string[],
  });
  const [invitingBusy, setInvitingBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const inviteKeyRef = useRef<string | null>(null);

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || invitingBusy) return;
    inviteKeyRef.current ??= crypto.randomUUID();
    setInvitingBusy(true);
    setInviteError("");
    try {
      const res = await apiFetch<{ invite_path: string; expires_at: string }>("/api/staff", {
        method: "POST",
        idempotencyKey: inviteKeyRef.current,
        body: JSON.stringify({
          tenant_id: tenantId,
          full_name: inviteForm.fullName.trim(),
          email: inviteForm.email.trim(),
          role: inviteForm.role,
          outlet_ids: inviteForm.outletIds,
        }),
      });
      inviteKeyRef.current = null;
      setInviteForm({ open: false, fullName: "", email: "", role: "cashier", outletIds: [] });
      setInviteLink({
        url: `${window.location.origin}${res.invite_path}`,
        expiresAt: res.expires_at,
      });
      await loadStaff();
    } catch (error) {
      setInviteError(messageOf(error, "Undangan gagal dibuat."));
    } finally {
      setInvitingBusy(false);
    }
  };

  const revoke = async (payload: Record<string, unknown>, title: string, message: string) => {
    // §13.3 — one key per revoked target per attempt, reused on retry.
    const target = String(payload.invitation_id ?? payload.user_id ?? "");
    let key = revokeKeysRef.current.get(target);
    if (!key) {
      key = crypto.randomUUID();
      revokeKeysRef.current.set(target, key);
    }
    try {
      await apiFetch("/api/staff/revoke", {
        method: "POST",
        idempotencyKey: key,
        body: JSON.stringify(payload),
      });
      revokeKeysRef.current.delete(target);
      await loadStaff();
      setFeedback({ isOpen: true, type: "success", title, message });
    } catch (error) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Pencabutan Gagal",
        message: messageOf(error, "Akses tidak berubah."),
      });
    }
  };

  const outlets = activeMembership?.outlets ?? [];
  const activeServices = services.filter((s) => s.is_active).length;

  if (authLoading) {
    return (
      <PageShell>
        <TopBar title="Administrasi Bisnis & Katalog" subtitle="Menyiapkan sesi…" />
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
        title="Administrasi Bisnis & Katalog"
        subtitle={activeOutlet ? `${activeOutlet.name} · ${activeOutlet.code}` : "Outlet belum dipilih"}
        actions={
          activeTab === "services" && canManageCatalog ? (
            <Button onClick={() => openServiceForm(null)}>
              <Plus className="size-4" /> Layanan Baru
            </Button>
          ) : activeTab === "staff" && canManageStaff ? (
            <Button onClick={() => setInviteForm((f) => ({ ...f, open: true }))}>
              <Plus className="size-4" /> Undang Staf
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        <nav className="flex gap-2.5 overflow-x-auto border-b border-line pb-3" aria-label="Bagian administrasi">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`press-fx flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-ink text-white shadow-card"
                    : "border border-line text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ------------------------------------------------------ customers -- */}
        {activeTab === "customers" && (
          <Section>
            <SectionHead
              eyebrow="FR05 · FR07"
              title="Direktori Pelanggan"
              description="Ketik minimal dua huruf nama, nomor WhatsApp, atau nomor struk. Pencarian kosong sengaja tidak menampilkan seluruh kontak."
              size="sm"
            />
            <SearchInput
              icon={<Search className="size-4" />}
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Cari nama, 0812…, atau nomor struk"
              aria-label="Cari pelanggan"
              className="max-w-xl"
            />

            {customersState === "idle" && (
              <Card tone="sunken" className="text-sm text-ink-muted">
                Mulai ketik untuk mencari. Daftar pelanggan hanya mencakup outlet yang boleh Anda akses.
              </Card>
            )}
            {customersState !== "idle" && (customersState !== "ready" || customers.length === 0) && (
              <StateBlock
                state={customersState}
                message={customersError}
                empty="Tidak ada pelanggan yang cocok dengan pencarian ini."
              />
            )}
            {customersState === "ready" && customers.length > 0 && (
              <Card pad="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-sunken text-ink-faint">
                      <tr>
                        <th className="px-6 py-4 font-bold uppercase tracking-wider">Nama</th>
                        <th className="px-6 py-4 font-bold uppercase tracking-wider">WhatsApp</th>
                        <th className="px-6 py-4 font-bold uppercase tracking-wider">Order</th>
                        <th className="px-6 py-4 font-bold uppercase tracking-wider">Nilai</th>
                        <th className="px-6 py-4 font-bold uppercase tracking-wider">Terakhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {customers.map((c) => (
                        <tr key={c.id} className="transition-colors hover:bg-sunken">
                          <td className="px-6 py-4 font-bold text-ink">{c.name}</td>
                          <td className="num px-6 py-4 text-ink-muted">{c.phone ?? "—"}</td>
                          <td className="num px-6 py-4 font-bold">{c.orders_count}x</td>
                          <td className="num px-6 py-4 font-bold">
                            {c.total_spent_idr === null ? "—" : formatRupiah(c.total_spent_idr)}
                          </td>
                          <td className="px-6 py-4 text-ink-muted">
                            {c.last_order_at
                              ? new Date(c.last_order_at).toLocaleDateString("id-ID")
                              : "Belum ada order"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </Section>
        )}

        {/* ------------------------------------------------------- services -- */}
        {activeTab === "services" && (
          <Section>
            <SectionHead
              eyebrow="FR04"
              title="Layanan & Harga"
              description="Setiap perubahan tarif, minimum, kelipatan, SLA, atau alur kerja menerbitkan versi baru. Versi lama tetap melekat pada order yang sudah dibuat."
              size="sm"
              actions={
                <Button variant="outline" onClick={loadServices} disabled={servicesState === "loading"}>
                  <RefreshCw className={`size-4 ${servicesState === "loading" ? "animate-spin" : ""}`} />
                  Muat Ulang
                </Button>
              }
            />

            {!canManageCatalog && (
              <Notice tone="info" icon={<Lock className="size-4" />}>
                Peran Anda hanya bisa melihat katalog. Perubahan harga dilakukan owner atau supervisor.
              </Notice>
            )}

            {servicesState !== "ready" || services.length === 0 ? (
              <StateBlock
                state={servicesState}
                message={servicesError}
                empty="Belum ada layanan di outlet ini."
                onRetry={loadServices}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile label="Layanan Aktif" value={activeServices} hint="Bisa dipilih kasir di POS" />
                  <StatTile
                    label="Diarsipkan"
                    value={services.length - activeServices}
                    hint="Tetap tampil di struk dan order lama"
                  />
                  <StatTile
                    label="Total Versi Harga"
                    value={services.reduce((sum, s) => sum + s.version_count, 0)}
                    hint="Riwayat harga tidak pernah ditimpa"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {services.map((s) => (
                    <Card key={s.service_id} className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <h3 className="truncate text-base font-bold">{s.name}</h3>
                          <span className="eyebrow block">
                            {s.unit === "kg" ? "Per kilogram" : "Per satuan"} · versi ke-{s.version_count}
                          </span>
                        </div>
                        <Badge variant={s.is_active ? "success" : "muted"}>
                          {s.is_active ? "Aktif" : "Diarsipkan"}
                        </Badge>
                      </div>

                      <div className="space-y-2 border-t border-line pt-4">
                        <DataRow label="Tarif" value={formatRupiah(s.price_per_unit_idr)} strong />
                        {s.unit === "kg" && (
                          <>
                            <DataRow label="Minimum" value={`${(s.min_grams / 1000).toFixed(1)} kg`} />
                            <DataRow label="Kelipatan" value={`${s.increment_grams} g`} />
                          </>
                        )}
                        <DataRow label="Target SLA" value={`${s.sla_hours} jam`} />
                        <DataRow
                          label="Alur kerja"
                          value={(s.workflow_steps ?? []).length + " tahap"}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                          <History className="size-3.5" />
                          {s.orders_on_current_version > 0
                            ? `${s.orders_on_current_version} order memakai versi ini`
                            : "Versi ini belum dipakai order"}
                        </span>
                        <div className="ml-auto flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openServiceForm(s)}
                            disabled={!canManageCatalog}
                          >
                            Revisi Harga
                          </Button>
                          <Button
                            variant="subtle"
                            onClick={() => toggleServiceActive(s)}
                            disabled={!canManageCatalog}
                          >
                            {s.is_active ? "Arsipkan" : "Aktifkan"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

        {/* ---------------------------------------------------------- staff -- */}
        {activeTab === "staff" && (
          <Section>
            <SectionHead
              eyebrow="FR02"
              title="Staf & Hak Akses"
              description="Undangan berlaku 72 jam, peran dan outlet ditetapkan saat mengundang. Pencabutan langsung memutus akses pada permintaan berikutnya."
              size="sm"
              actions={
                <Button variant="outline" onClick={loadStaff} disabled={staffState === "loading"}>
                  <RefreshCw className={`size-4 ${staffState === "loading" ? "animate-spin" : ""}`} />
                  Muat Ulang
                </Button>
              }
            />

            {staffState !== "ready" ? (
              <StateBlock
                state={staffState}
                message={staffError}
                empty="Belum ada staf terdaftar."
                onRetry={loadStaff}
              />
            ) : (
              <div className="space-y-8">
                <div className="space-y-3">
                  <span className="eyebrow block">Staf Aktif</span>
                  {members.length === 0 ? (
                    <Card tone="sunken" className="text-sm text-ink-muted">Belum ada staf.</Card>
                  ) : (
                    members.map((m) => (
                      <Card key={m.user_id} pad="sm" className="flex flex-wrap items-center gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{m.full_name}</span>
                            <Badge variant={m.role === "owner" ? "ink" : "outline"}>{m.role}</Badge>
                            {m.is_self && <Badge variant="accent">Anda</Badge>}
                          </div>
                          <p className="num text-xs text-ink-muted">{m.email}</p>
                          <p className="text-xs text-ink-faint">
                            {m.all_outlets
                              ? "Semua outlet dalam bisnis ini"
                              : m.outlets.map((o) => o.name).join(", ") || "Belum ditugaskan ke outlet"}
                          </p>
                        </div>
                        {canManageStaff && m.role !== "owner" && !m.is_self && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              revoke(
                                { tenant_id: tenantId, user_id: m.user_id },
                                "Akses Dicabut",
                                `${m.full_name} tidak lagi bisa membuka data bisnis ini.`
                              )
                            }
                          >
                            Cabut Akses
                          </Button>
                        )}
                      </Card>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  <span className="eyebrow block">Undangan</span>
                  {invitations.length === 0 ? (
                    <Card tone="sunken" className="text-sm text-ink-muted">
                      Tidak ada undangan yang menunggu.
                    </Card>
                  ) : (
                    invitations.map((inv) => (
                      <Card key={inv.invitation_id} pad="sm" className="flex flex-wrap items-center gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{inv.full_name}</span>
                            <Badge variant="outline">{inv.role}</Badge>
                            <Badge
                              variant={
                                inv.status === "PENDING"
                                  ? "warning"
                                  : inv.status === "EXPIRED"
                                    ? "danger"
                                    : "muted"
                              }
                            >
                              {inv.status === "PENDING"
                                ? "Menunggu"
                                : inv.status === "EXPIRED"
                                  ? "Kedaluwarsa"
                                  : "Dicabut"}
                            </Badge>
                          </div>
                          <p className="num text-xs text-ink-muted">{inv.email}</p>
                          <p className="text-xs text-ink-faint">
                            Berlaku sampai {new Date(inv.expires_at).toLocaleString("id-ID")} ·{" "}
                            {inv.outlets.map((o) => o.code).join(", ") || "seluruh outlet"}
                          </p>
                        </div>
                        {canManageStaff && inv.status === "PENDING" && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              revoke(
                                { invitation_id: inv.invitation_id },
                                "Undangan Dicabut",
                                "Tautan undangan tersebut sudah tidak bisa dipakai."
                              )
                            }
                          >
                            Cabut Undangan
                          </Button>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* -------------------------------------------------------- outlets -- */}
        {activeTab === "outlets" && (
          <Section>
            <SectionHead
              eyebrow="FR01 · FR03"
              title="Outlet"
              description="Outlet yang boleh Anda akses beserta zona waktunya."
              size="sm"
            />
            {outlets.length === 0 ? (
              <Card tone="sunken" className="text-sm text-ink-muted">Belum ada outlet.</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {outlets.map((o) => (
                  <Card key={o.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{o.code}</Badge>
                      {activeOutlet?.id === o.id && <Badge variant="accent">Sedang Dipakai</Badge>}
                    </div>
                    <h3 className="text-lg font-bold">{o.name}</h3>
                    <div className="space-y-2 border-t border-line pt-4 text-xs text-ink-muted">
                      <span className="flex items-center gap-2">
                        <Clock className="size-3.5 text-ink-faint" /> Zona waktu: {o.timezone}
                      </span>
                      <span className="flex items-center gap-2">
                        <Phone className="size-3.5 text-ink-faint" /> Kontak diatur saat onboarding
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ------------------------------------------------------- policies -- */}
        {activeTab === "policies" && (
          <Section>
            <SectionHead
              eyebrow="§5.5 · FR22"
              title="Kebijakan Outlet"
              description="Ambang pengingat cucian mengendap dan batas kredit dipakai langsung oleh antrean tindak lanjut dan serah terima."
              size="sm"
            />
            {policiesState !== "ready" ? (
              <StateBlock
                state={policiesState}
                message={policiesError}
                empty="Kebijakan belum tersedia."
                onRetry={loadPolicies}
              />
            ) : (
              <Card className="max-w-2xl space-y-6">
                <Field
                  label="Ambang Cucian Siap Belum Diambil (hari kalender)"
                  hint="Order siap yang melewati batas ini masuk antrean tindak lanjut. Standar 3 hari."
                >
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={policies.uncollected_threshold_days}
                    onChange={(e) =>
                      setPolicies((p) => ({ ...p, uncollected_threshold_days: Number(e.target.value) }))
                    }
                    disabled={!canManageCatalog}
                  />
                </Field>

                <Field
                  label="Batas Maksimal Serah Terima dengan Piutang (Rp)"
                  hint="Sisa tagihan di atas nominal ini butuh persetujuan owner atau supervisor."
                >
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={policies.max_credit_limit_idr}
                    onChange={(e) =>
                      setPolicies((p) => ({ ...p, max_credit_limit_idr: Number(e.target.value) }))
                    }
                    disabled={!canManageCatalog}
                  />
                </Field>

                <Field
                  label="Kebijakan Kompensasi Kehilangan / Kerusakan"
                  hint="Ditinjau manusia saat isu ditutup; sistem tidak menghitung kompensasi otomatis."
                >
                  <textarea
                    rows={3}
                    className="control h-auto py-3"
                    value={policies.compensation_policy}
                    onChange={(e) =>
                      setPolicies((p) => ({ ...p, compensation_policy: e.target.value }))
                    }
                    disabled={!canManageCatalog}
                  />
                </Field>

                <div className="flex justify-end border-t border-line pt-6">
                  <Button onClick={savePolicies} disabled={!canManageCatalog || savingPolicies}>
                    {savingPolicies && <Loader2 className="size-4 animate-spin" />}
                    {savingPolicies ? "Menyimpan…" : "Simpan Kebijakan"}
                  </Button>
                </div>
              </Card>
            )}
          </Section>
        )}
      </PageBody>

      {/* --------------------------------------------------- service modal -- */}
      <Modal
        open={Boolean(serviceForm?.open)}
        onClose={() => setServiceForm(null)}
        eyebrow="FR04"
        title={serviceForm?.editing ? "Terbitkan Versi Baru" : "Layanan Baru"}
        description={
          serviceForm?.editing
            ? "Nilai lama tetap tersimpan sebagai versi sebelumnya dan masih dipakai order yang sudah berjalan."
            : "Versi harga pertama dibuat bersama layanan ini."
        }
      >
        {serviceForm && (
          <form onSubmit={submitService} className="space-y-5">
            {serviceError && (
              <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                {serviceError}
              </Notice>
            )}

            <Field label="Nama Layanan" required>
              <Input
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                placeholder="Cuci Setrika Reguler"
              />
            </Field>

            <Field label="Satuan" required>
              <Select
                value={serviceForm.unit}
                onValueChange={(v) => setServiceForm({ ...serviceForm, unit: v })}
                options={UNIT_OPTIONS}
              />
            </Field>

            <Field
              label={serviceForm.unit === "kg" ? "Tarif per kg (Rp)" : "Tarif per satuan (Rp)"}
              required
            >
              <Input
                type="number"
                min={0}
                value={serviceForm.price}
                onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
              />
            </Field>

            {serviceForm.unit === "kg" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum (gram)" hint="Contoh 3000 untuk minimum 3 kg">
                  <Input
                    type="number"
                    min={0}
                    value={serviceForm.minGrams}
                    onChange={(e) => setServiceForm({ ...serviceForm, minGrams: e.target.value })}
                  />
                </Field>
                <Field label="Kelipatan (gram)" hint="Pembulatan ke atas mengikuti nilai ini">
                  <Input
                    type="number"
                    min={1}
                    value={serviceForm.incrementGrams}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, incrementGrams: e.target.value })
                    }
                  />
                </Field>
              </div>
            )}

            <Field label="Target SLA (jam)" required hint="Dihitung dalam jam kalender sejak order diterima.">
              <Input
                type="number"
                min={1}
                value={serviceForm.slaHours}
                onChange={(e) => setServiceForm({ ...serviceForm, slaHours: e.target.value })}
              />
            </Field>

            <Field label="Alur Kerja Produksi" required>
              <Select
                value={serviceForm.workflow}
                onValueChange={(v) => setServiceForm({ ...serviceForm, workflow: v })}
                options={WORKFLOW_OPTIONS}
              />
            </Field>

            <Checkbox
              checked={serviceForm.isActive}
              onChange={(e) => setServiceForm({ ...serviceForm, isActive: e.target.checked })}
              label="Aktif dan bisa dipilih kasir"
            />

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" onClick={() => setServiceForm(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={savingService}>
                {savingService && <Loader2 className="size-4 animate-spin" />}
                {savingService ? "Menerbitkan…" : "Terbitkan Versi"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------------------------------------------- invite modal -- */}
      <Modal
        open={inviteForm.open}
        onClose={() => setInviteForm((f) => ({ ...f, open: false }))}
        eyebrow="FR02"
        title="Undang Staf"
        description="Tautan undangan berlaku 72 jam dan hanya bisa dipakai oleh pemilik email tersebut."
      >
        <form onSubmit={submitInvite} className="space-y-5">
          {inviteError && (
            <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
              {inviteError}
            </Notice>
          )}

          <Field label="Nama Lengkap" required>
            <Input
              value={inviteForm.fullName}
              onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
              placeholder="Riko Hermawan"
            />
          </Field>

          <Field label="Email Login" required hint="Harus sama dengan email yang dipakai staf saat masuk.">
            <Input
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              placeholder="riko@rakkita.id"
            />
          </Field>

          <Field label="Peran" required>
            <Select
              value={inviteForm.role}
              onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}
              options={ROLE_OPTIONS}
            />
          </Field>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-ink-soft">
              Outlet yang Boleh Diakses
              {inviteForm.role !== "supervisor" && <span className="ml-0.5 text-danger">*</span>}
            </span>
            <div className="space-y-3 rounded-control border border-line p-4">
              {outlets.map((o) => (
                <Checkbox
                  key={o.id}
                  checked={inviteForm.outletIds.includes(o.id)}
                  onChange={(e) =>
                    setInviteForm((f) => ({
                      ...f,
                      outletIds: e.target.checked
                        ? [...f.outletIds, o.id]
                        : f.outletIds.filter((id) => id !== o.id),
                    }))
                  }
                  label={`${o.name} (${o.code})`}
                />
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">
              Supervisor otomatis menjangkau seluruh outlet bisnis; kasir dan operator wajib dipilih.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => setInviteForm((f) => ({ ...f, open: false }))}
            >
              Batal
            </Button>
            <Button type="submit" disabled={invitingBusy}>
              {invitingBusy && <Loader2 className="size-4 animate-spin" />}
              {invitingBusy ? "Membuat undangan…" : "Buat Undangan 72 Jam"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------ invite link modal -- */}
      <Modal
        open={Boolean(inviteLink)}
        onClose={() => setInviteLink(null)}
        eyebrow="Sekali Tampil"
        title="Tautan Undangan Siap"
        description="Salin dan kirim sendiri ke staf lewat WhatsApp atau email. Tautan ini tidak bisa ditampilkan ulang."
        footer={
          <Button onClick={() => setInviteLink(null)} className="w-full sm:w-auto">
            Selesai
          </Button>
        }
      >
        {inviteLink && (
          <div className="space-y-4">
            <div className="num break-all rounded-control border border-line bg-sunken p-4 text-xs">
              {inviteLink.url}
            </div>
            <Button
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(inviteLink.url)}
              className="w-full"
            >
              <Copy className="size-4" /> Salin Tautan
            </Button>
            <Notice tone="warning">
              Berlaku sampai {new Date(inviteLink.expiresAt).toLocaleString("id-ID")}. Setelah itu
              undangan harus dibuat ulang.
            </Notice>
          </div>
        )}
      </Modal>

      <FeedbackModal
        state={feedback}
        onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
      />
    </PageShell>
  );
}
