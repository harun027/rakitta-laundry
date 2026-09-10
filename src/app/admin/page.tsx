"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import { 
  ArrowLeft, 
  Users, 
  Shirt, 
  ShieldCheck, 
  Building2, 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Clock, 
  ArrowRight,
  CheckCircle2,
  FileCheck,
  AlertCircle,
  Save,
  X
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Select, type SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";

const STAFF_ROLE_OPTIONS: SelectOption[] = [
  { value: "cashier", label: "Cashier (Kasir)", hint: "Input order, terima pembayaran, serah terima" },
  { value: "operator", label: "Operator (Lantai Produksi)", hint: "Update antrean mesin, QC, dan penataan rak" },
  { value: "supervisor", label: "Supervisor (Persetujuan & Laci Kas)", hint: "Persetujuan kredit, revisi harga, closing laci kas" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"customers" | "services" | "staff" | "outlets" | "policies">("customers");
  const [searchQuery, setSearchQuery] = useState("");

  // Feedback Modal State (replaces alert)
  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  // Customers (FR05)
  const [customers, setCustomers] = useState([
    { id: "1", name: "Ahmad Dahlan", phone: "081234567890", ordersCount: 14, totalSpent: 420000, outlet: "Surabaya Pusat" },
    { id: "2", name: "Siti Rahma", phone: "085678901234", ordersCount: 8, totalSpent: 310000, outlet: "Surabaya Pusat" },
    { id: "3", name: "Budi Santoso", phone: "087789012345", ordersCount: 22, totalSpent: 780000, outlet: "Jakarta Selatan" },
    { id: "4", name: "Dewi Lestari", phone: "081999888777", ordersCount: 5, totalSpent: 175000, outlet: "Bandung Dago" },
  ]);

  // Services (FR04)
  const [services, setServices] = useState([
    { id: "1", name: "Cuci Setrika Reguler", unit: "kg", rate: 8000, min: "3.000g", inc: "100g", sla: "48 Jam", status: "Aktif" },
    { id: "2", name: "Cuci Setrika Express", unit: "kg", rate: 15000, min: "3.000g", inc: "100g", sla: "24 Jam", status: "Aktif" },
    { id: "3", name: "Setrika Saja", unit: "kg", rate: 6000, min: "2.000g", inc: "100g", sla: "24 Jam", status: "Aktif" },
    { id: "4", name: "Bedcover King", unit: "piece", rate: 35000, min: "-", inc: "1 pcs", sla: "48 Jam", status: "Aktif" },
  ]);

  // Staff (FR02)
  const [staff, setStaff] = useState([
    { id: "1", name: "Harun (Owner)", email: "harun@rakkita.id", role: "Owner", outlet: "Semua Outlet", status: "Aktif" },
    { id: "2", name: "Rian Saputra", email: "rian@rakkita.id", role: "Supervisor", outlet: "Surabaya Pusat", status: "Aktif" },
    { id: "3", name: "Nadia Putri", email: "nadia@rakkita.id", role: "Cashier", outlet: "Surabaya Pusat", status: "Aktif" },
    { id: "4", name: "Joko Anwar", email: "joko@rakkita.id", role: "Operator", outlet: "Surabaya Pusat", status: "Aktif" },
  ]);

  // Outlets (FR01, FR03)
  const [outlets, setOutlets] = useState([
    { id: "1", name: "Surabaya Pusat (Utama)", code: "SBY-01", tz: "Asia/Jakarta (WIB)", phone: "0812-9988-7766", hours: "08:00 - 20:00" },
    { id: "2", name: "Jakarta Selatan (Fatmawati)", code: "JKT-01", tz: "Asia/Jakarta (WIB)", phone: "0813-8877-6655", hours: "07:00 - 21:00" },
    { id: "3", name: "Bandung Dago (Dipatiukur)", code: "BDG-01", tz: "Asia/Jakarta (WIB)", phone: "0815-7766-5544", hours: "08:00 - 20:00" },
    { id: "4", name: "Bali Seminyak (Sunset Road)", code: "DPS-01", tz: "Asia/Makassar (WITA)", phone: "0818-6655-4433", hours: "08:00 - 22:00" },
  ]);

  // Policies (FR04, FR22, FR37)
  const [policies, setPolicies] = useState({
    maxCreditLimitIdr: 100000,
    uncollectedThresholdDays: 3,
    compensationPolicy: "Maksimal 5x biaya cuci layanan terkait dengan bukti valid.",
    allowCashierDiscountWithoutApproval: false,
    maxCashierDiscountIdr: 5000,
  });

  // Modal State for adding new items
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("cashier");

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    setCustomers((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        name: newCustName.trim(),
        phone: newCustPhone.trim() || "-",
        ordersCount: 0,
        totalSpent: 0,
        outlet: "Surabaya Pusat",
      },
    ]);
    setNewCustName("");
    setNewCustPhone("");
    setIsModalOpen(false);
    setFeedback({
      isOpen: true,
      type: "success",
      title: "Pelanggan Berhasil Didaftarkan",
      message: "Data pelanggan baru telah tersimpan dan siap digunakan pada POS Kasir.",
    });
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim()) return;
    setStaff((prev) => [
      ...prev,
      {
        id: `st-${Date.now()}`,
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        role: newStaffRole.toUpperCase(),
        outlet: "Surabaya Pusat",
        status: "Aktif (Undangan 72 Jam)",
      },
    ]);
    setNewStaffName("");
    setNewStaffEmail("");
    setIsModalOpen(false);
    setFeedback({
      isOpen: true,
      type: "success",
      title: "Undangan Staf Berhasil Dikirim",
      message: "Link aktivasi akun telah dikirim ke email staf dan aktif selama 72 jam.",
    });
  };

  const handleSavePolicies = () => {
    setFeedback({
      isOpen: true,
      type: "success",
      title: "Kebijakan Outlet Disimpan",
      message: "Batasan kredit, masa simpan rak, dan kebijakan kompensasi berhasil diperbarui.",
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111111] antialiased pb-28 selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="size-10 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-100 transition-all"
            >
              <ArrowLeft className="size-4 text-neutral-800" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Administrasi Bisnis & Katalog</h1>
              <p className="text-xs text-neutral-500">Master Data Pelanggan, Layanan, Staff, Outlet & Kebijakan</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="size-4" /> + Tambah Data Baru
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 sm:px-12 py-10 space-y-10">
        {/* Editorial Sub-Navigation Tabs */}
        <div className="flex gap-3 overflow-x-auto pb-2 border-b border-neutral-200">
          {[
            { id: "customers", label: "Pelanggan (Customers)", icon: Users },
            { id: "services", label: "Layanan & Harga (Services)", icon: Shirt },
            { id: "staff", label: "Staff & Hak Akses (RBAC)", icon: ShieldCheck },
            { id: "outlets", label: "Daftar Outlet (Locations)", icon: Building2 },
            { id: "policies", label: "Kebijakan Outlet (Policies)", icon: FileCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                  isActive 
                    ? "bg-black text-white shadow-md" 
                    : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Customers */}
        {activeTab === "customers" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="relative max-w-md w-full">
                <Search className="size-4 absolute left-3.5 top-3 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau no. telepon (+62)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-neutral-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <span className="text-xs text-neutral-500 font-mono">Total: {customers.length} Pelanggan</span>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">Nama Pelanggan</th>
                    <th className="py-4 px-6 font-bold">Nomor WhatsApp</th>
                    <th className="py-4 px-6 font-bold">Outlet Terdaftar</th>
                    <th className="py-4 px-6 font-bold">Total Order</th>
                    <th className="py-4 px-6 font-bold">Akumulasi Nilai</th>
                    <th className="py-4 px-6 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-bold text-neutral-900">{c.name}</td>
                      <td className="py-4 px-6 font-mono text-neutral-600">{c.phone}</td>
                      <td className="py-4 px-6">{c.outlet}</td>
                      <td className="py-4 px-6 font-mono font-bold">{c.ordersCount}x</td>
                      <td className="py-4 px-6 font-mono font-bold">{formatRupiah(c.totalSpent)}</td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-neutral-500 hover:text-black font-bold">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Services & Pricing */}
        {activeTab === "services" && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-neutral-100 text-xs text-neutral-600 flex items-center justify-between">
              <span><strong>Snapshot Harga:</strong> Perubahan harga akan membuat versi baru. Struk lama tetap mengunci harga historis.</span>
              <span className="font-mono font-bold">Versi Aktif</span>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">Nama Layanan</th>
                    <th className="py-4 px-6 font-bold">Satuan</th>
                    <th className="py-4 px-6 font-bold">Harga per Unit</th>
                    <th className="py-4 px-6 font-bold">Min. Billable</th>
                    <th className="py-4 px-6 font-bold">Kelipatan</th>
                    <th className="py-4 px-6 font-bold">SLA Target</th>
                    <th className="py-4 px-6 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {services.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-bold text-neutral-900">{s.name}</td>
                      <td className="py-4 px-6 uppercase font-mono font-bold">{s.unit}</td>
                      <td className="py-4 px-6 font-mono font-bold text-neutral-900">{formatRupiah(s.rate)}</td>
                      <td className="py-4 px-6 font-mono">{s.min}</td>
                      <td className="py-4 px-6 font-mono">{s.inc}</td>
                      <td className="py-4 px-6 font-mono font-bold text-neutral-700">{s.sla}</td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-neutral-500 hover:text-black font-bold">Revisi Harga</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Staff & Access */}
        {activeTab === "staff" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">Nama Staff</th>
                    <th className="py-4 px-6 font-bold">Email Login</th>
                    <th className="py-4 px-6 font-bold">Role Hak Akses</th>
                    <th className="py-4 px-6 font-bold">Penugasan Outlet</th>
                    <th className="py-4 px-6 font-bold">Status Undangan</th>
                    <th className="py-4 px-6 text-right font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {staff.map((st) => (
                    <tr key={st.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-bold text-neutral-900">{st.name}</td>
                      <td className="py-4 px-6 font-mono text-neutral-600">{st.email}</td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-900 font-mono font-bold text-[10px]">
                          {st.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">{st.outlet}</td>
                      <td className="py-4 px-6 font-bold text-emerald-600">{st.status}</td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-neutral-500 hover:text-black font-bold">Kelola</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Outlets */}
        {activeTab === "outlets" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {outlets.map((ot) => (
              <div key={ot.id} className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-4 hover-lift shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-neutral-100 text-neutral-700">
                    {ot.code}
                  </span>
                  <span className="text-xs text-neutral-400">{ot.hours}</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-900">{ot.name}</h3>
                <div className="space-y-1.5 text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-neutral-400" />
                    <span>Timezone: <strong>{ot.tz}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5 text-neutral-400" />
                    <span>Kontak WhatsApp: <strong>{ot.phone}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Policies */}
        {activeTab === "policies" && (
          <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-8 shadow-xs max-w-3xl">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-neutral-900">Kebijakan Operasional & Batasan Otomatis</h2>
              <p className="text-xs text-neutral-500">Aturan batasan kredit kasir, kompensasi komplain, dan masa simpan rak.</p>
            </div>

            <div className="space-y-6 text-xs sm:text-sm">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-700 block">Batas Maksimal Kredit Piutang Serah Terima (IDR)</label>
                <input
                  type="number"
                  value={policies.maxCreditLimitIdr}
                  onChange={(e) => setPolicies({ ...policies, maxCreditLimitIdr: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 font-mono font-bold"
                />
                <span className="text-[11px] text-neutral-400">Order dengan sisa tagihan di atas nominal ini wajib lunas atau butuh persetujuan Owner.</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-700 block">Batas Hari Pengingat Cucian Mengendap (Hari)</label>
                <input
                  type="number"
                  value={policies.uncollectedThresholdDays}
                  onChange={(e) => setPolicies({ ...policies, uncollectedThresholdDays: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 font-mono font-bold"
                />
                <span className="text-[11px] text-neutral-400">Order berstatus READY yang tersimpan di rak melebihi hari ini masuk ke antrean follow-up WhatsApp.</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-700 block">Kebijakan Kompensasi Kehilangan / Rusak</label>
                <textarea
                  rows={3}
                  value={policies.compensationPolicy}
                  onChange={(e) => setPolicies({ ...policies, compensationPolicy: e.target.value })}
                  className="w-full p-4 rounded-xl border border-neutral-200 text-xs"
                />
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePolicies}
                  className="px-6 py-3 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition-all flex items-center gap-2"
                >
                  <Save className="size-4" /> Simpan Kebijakan Outlet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Tambah Data */}
        <Modal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={activeTab === "customers" ? "Tambah Pelanggan Baru" : "Kirim Undangan Staf"}
          description={activeTab === "customers" ? "Daftarkan kontak pelanggan baru di outlet ini" : "Kirim link undangan login aktif 72 jam"}
        >
          {activeTab === "customers" ? (
            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs sm:text-sm">
              <Field label="Nama Pelanggan" required>
                <Input
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Contoh: Bpk. Kurniawan"
                />
              </Field>
              <Field label="Nomor WhatsApp (+62)">
                <Input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                />
              </Field>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Batal</Button>
                <Button type="submit">Simpan Pelanggan</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveStaff} className="space-y-4 text-xs sm:text-sm">
              <Field label="Nama Lengkap Staf" required>
                <Input
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Contoh: Riko Hermawan"
                />
              </Field>
              <Field label="Email Login" required>
                <Input
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="riko@rakkita.id"
                />
              </Field>
              <Field label="Role Hak Akses">
                <Select
                  value={newStaffRole}
                  onValueChange={setNewStaffRole}
                  options={STAFF_ROLE_OPTIONS}
                />
              </Field>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Batal</Button>
                <Button type="submit">Kirim Undangan (72 Jam)</Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Global Feedback Modal */}
        <FeedbackModal
          state={feedback}
          onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
        />
      </main>
    </div>
  );
}
