"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ArrowRight, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setErrorMessage("Email atau kata sandi tidak sesuai.");
        } else if (error.message.includes("Email not confirmed")) {
          setErrorMessage("Email belum dikonfirmasi. Periksa kotak masuk Anda.");
        } else {
          setErrorMessage(error.message || "Gagal masuk ke sistem.");
        }
        setIsLoading(false);
        return;
      }

      if (data?.session) {
        window.location.href = "/";
      }
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau konfigurasi Supabase.");
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
        <p className="text-xs text-neutral-500 font-medium">Sistem Operasional Laundry untuk Indonesia</p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 sm:p-12 shadow-xl space-y-8 my-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Masuk ke Outlet</h1>
          <p className="text-xs text-neutral-500">Gunakan akun email yang terdaftar sebagai Owner, SPV, Kasir, atau Operator</p>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
            <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Gagal Masuk</span>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs sm:text-sm">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-700">Email Akun *</label>
            <div className="relative">
              <Mail className="size-4 absolute left-3.5 top-3.5 text-neutral-400" />
              <input
                type="email"
                required
                placeholder="nama@rakkita.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-neutral-700">Kata Sandi *</label>
            </div>
            <div className="relative">
              <Lock className="size-4 absolute left-3.5 top-3.5 text-neutral-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-neutral-200 bg-neutral-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 mt-2 rounded-full bg-black text-white font-bold text-xs hover:bg-neutral-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Memeriksa Akun...
              </>
            ) : (
              <>
                Masuk ke Sistem <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-neutral-100 text-center text-xs text-neutral-500">
          Belum punya akun bisnis?{" "}
          <Link href="/onboarding" className="font-bold text-neutral-900 hover:underline">
            Daftar Outlet Baru
          </Link>
        </div>
      </div>

      <footer className="text-center text-xs text-neutral-400 mb-4">
        © 2026 Rakkita. Sistem Hak Akses Multi-Peran & Keamanan Berlapis.
      </footer>
    </div>
  );
}
