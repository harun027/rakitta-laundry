"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

/* PRD §22.2 "Account: Login, password reset, invitations, business onboarding".
 * The response is deliberately identical whether the email exists or not —
 * §10.2 lists login abuse and account enumeration as threats to control. */

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Isi email akun Anda lebih dulu.");
      return;
    }
    setIsSending(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password/update`,
      });
      // Never reveal whether the address is registered.
      if (error && !/user not found/i.test(error.message)) {
        setErrorMessage("Gagal mengirim tautan. Coba lagi beberapa saat.");
        setIsSending(false);
        return;
      }
      setSent(true);
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau konfigurasi Supabase.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-paper p-6 sm:p-12">
      <header className="mt-4 space-y-2 text-center">
        <Link href="/login" className="inline-flex">
          <Logo height={40} priority />
        </Link>
        <p className="text-xs font-medium text-ink-muted">Pemulihan Akses Akun Staf</p>
      </header>

      <main className="w-full max-w-md">
        <Card pad="lg" className="space-y-6">
          {sent ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
                <CheckCircle2 className="size-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold tracking-tight">Periksa Email Anda</h1>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Jika <span className="font-semibold text-ink">{email.trim()}</span> terdaftar, kami mengirim
                  tautan penggantian kata sandi ke sana. Tautan hanya berlaku sebentar dan sekali pakai.
                </p>
              </div>
              <Notice tone="info">
                <span>
                  Tidak menerima email? Periksa folder spam, lalu minta ulang. Jangan bagikan tautannya kepada siapa
                  pun — pemegang tautan bisa mengganti kata sandi akun ini.
                </span>
              </Notice>
              <Button asChild variant="outline" size="block">
                <Link href="/login">Kembali ke Halaman Masuk</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <span className="eyebrow block">Lupa Kata Sandi</span>
                <h1 className="text-2xl font-extrabold tracking-tight">Kirim Tautan Pemulihan</h1>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Masukkan email yang terdaftar sebagai Owner, Supervisor, Kasir, atau Operator.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Field label="Email Akun" required>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <Input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrorMessage("");
                      }}
                      placeholder={`nama@${BRAND.name.toLowerCase()}.id`}
                      className="pl-11"
                    />
                  </div>
                </Field>

                {errorMessage && (
                  <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                    <span>{errorMessage}</span>
                  </Notice>
                )}

                <Button type="submit" size="block" disabled={isSending}>
                  {isSending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Mengirim…
                    </>
                  ) : (
                    <>
                      Kirim Tautan Pemulihan <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="border-t border-line pt-5 text-center text-xs text-ink-muted">
                Ingat kata sandinya?{" "}
                <Link href="/login" className="font-bold text-ink underline-offset-4 hover:underline">
                  Masuk
                </Link>
              </div>
            </>
          )}
        </Card>
      </main>

      <footer className="pt-10 text-center text-[11px] text-ink-faint">
        © 2026 {BRAND.name}. Pemulihan akun tercatat pada log audit.
      </footer>
    </div>
  );
}
