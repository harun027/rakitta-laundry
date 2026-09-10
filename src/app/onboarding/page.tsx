"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { Select, type SelectOption } from "@/components/ui/select";

const TIMEZONE_OPTIONS: SelectOption[] = [
  { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)", hint: "Waktu Indonesia Barat (UTC+7)" },
  { value: "Asia/Makassar", label: "Asia/Makassar (WITA)", hint: "Waktu Indonesia Tengah (UTC+8)" },
  { value: "Asia/Jayapura", label: "Asia/Jayapura (WIT)", hint: "Waktu Indonesia Timur (UTC+9)" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [outletName, setOutletName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [outletPhone, setOutletPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegisterAndBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();

      // 1. Sign up user on Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: ownerEmail.trim(),
        password: ownerPassword,
        options: {
          data: {
            full_name: ownerName.trim(),
          },
        },
      });

      if (authError) {
        setErrorMessage(authError.message || "Gagal membuat akun owner di Supabase.");
        setIsLoading(false);
        return;
      }

      // If user is logged in (session returned)
      if (authData.user) {
        // 2. Call /api/onboarding route
        try {
          await apiFetch("/api/onboarding", {
            method: "POST",
            body: JSON.stringify({
              business_name: businessName.trim(),
              outlet_name: outletName.trim(),
              timezone,
              outlet_phone: outletPhone.trim() || null,
              owner_name: ownerName.trim(),
            }),
          });
        } catch {
          // If already created or in offline preview mode, continue
        }
      }

      setStep(3);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || "Gagal menyelesaikan proses onboarding.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111111] flex flex-col justify-between items-center p-6 sm:p-12 antialiased selection:bg-black selection:text-white">
      {/* Brand Header */}
      <div className="text-center space-y-2 mt-4">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo height={40} priority />
        </Link>
        <p className="text-xs text-neutral-500 font-medium">Registrasi Bisnis & Onboarding Outlet Pertama</p>
      </div>

      {/* Main Form Box */}
      <div className="w-full max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 sm:p-12 shadow-xl space-y-8 my-8">
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
            <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Gagal Mendaftarkan Outlet</span>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
            className="space-y-6"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">LANGKAH 1 DARI 2</span>
              <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">Identitas Bisnis & Outlet</h2>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Nama Bisnis Laundry (Tenant) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Berkah Laundry Mandiri"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Nama Outlet Pertama *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Outlet Utama Surabaya"
                  value={outletName}
                  onChange={(e) => setOutletName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Zona Waktu Operasional (Timezone) *</label>
                <Select
                  value={timezone}
                  onValueChange={setTimezone}
                  options={TIMEZONE_OPTIONS}
                  className="w-full h-11 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Nomor WhatsApp Outlet *</label>
                <input
                  type="text"
                  required
                  placeholder="0812xxxxxxxx"
                  value={outletPhone}
                  onChange={(e) => setOutletPhone(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-black text-white font-bold text-xs hover:bg-neutral-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2"
            >
              Lanjutkan ke Akun Owner <ArrowRight className="size-4" />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleRegisterAndBootstrap} className="space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">LANGKAH 2 DARI 2</span>
              <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">Akun Owner Bisnis</h2>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Nama Lengkap Pemilik *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Harun Al-Rasyid"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Alamat Email Login *</label>
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700">Kata Sandi Baru *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Minimal 6 karakter"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border text-xs text-neutral-600 space-y-1">
              <div className="font-bold text-neutral-900">Ketentuan Pilot P0:</div>
              <p>Mendapatkan akses uji coba operasional 14 hari penuh untuk pencatatan kasir, kontrol produksi, dan rekonsiliasi kas.</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-3.5 px-5 rounded-full border border-neutral-300 font-bold text-xs hover:bg-neutral-100"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3.5 rounded-full bg-black text-white font-bold text-xs hover:bg-neutral-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Mendaftarkan...
                  </>
                ) : (
                  <>
                    Selesaikan Pendaftaran <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center space-y-6">
            <div className="size-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">Outlet Anda Siap Beroperasi!</h2>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Bisnis <span className="font-bold text-neutral-900">{businessName || "Rakkita Mandiri"}</span> telah terdaftar dengan timezone <span className="font-mono font-bold text-neutral-800">{timezone}</span>.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-black text-white font-bold text-xs hover:bg-neutral-800 shadow-md"
            >
              Masuk ke Pusat Operasional <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </div>

      <footer className="text-center text-xs text-neutral-400 mb-4">
        © 2026 Rakkita. Sistem Operasional Multi-Outlet.
      </footer>
    </div>
  );
}
