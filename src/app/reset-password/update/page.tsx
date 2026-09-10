"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

/* Landing page for the recovery link. Supabase turns the link into a session,
 * so this page only asks for the new password. */

const MIN_LENGTH = 8;

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // The recovery link is exchanged for a session before this runs.
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setErrorMessage(`Kata sandi minimal ${MIN_LENGTH} karakter.`);
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("Konfirmasi kata sandi belum sama.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message || "Gagal menyimpan kata sandi baru.");
        setIsSaving(false);
        return;
      }
      setDone(true);
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan atau konfigurasi Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-paper p-6 sm:p-12">
      <header className="mt-4">
        <Logo height={40} priority />
      </header>

      <main className="w-full max-w-md">
        <Card pad="lg" className="space-y-6">
          {done ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
                <CheckCircle2 className="size-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold tracking-tight">Kata Sandi Diperbarui</h1>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Gunakan kata sandi baru pada perangkat kasir dan ponsel Anda.
                </p>
              </div>
              <Button asChild size="block">
                <Link href="/login">Masuk Sekarang</Link>
              </Button>
            </div>
          ) : hasSession === false ? (
            <div className="space-y-5">
              <Notice tone="warning" icon={<AlertCircle className="size-4" />}>
                <span>
                  Tautan pemulihan tidak berlaku atau sudah kedaluwarsa. Minta tautan baru dari halaman lupa kata
                  sandi.
                </span>
              </Notice>
              <Button asChild variant="outline" size="block">
                <Link href="/reset-password">Minta Tautan Baru</Link>
              </Button>
            </div>
          ) : hasSession === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Memeriksa tautan…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <span className="eyebrow block">Langkah Terakhir</span>
                <h1 className="text-2xl font-extrabold tracking-tight">Buat Kata Sandi Baru</h1>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Minimal {MIN_LENGTH} karakter. Jangan memakai kata sandi bersama antar staf — catatan audit
                  memakai identitas perorangan.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Field label="Kata Sandi Baru" required>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMessage("");
                      }}
                      className="pl-11"
                    />
                  </div>
                </Field>

                <Field label="Ulangi Kata Sandi" required>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(e) => {
                        setConfirmation(e.target.value);
                        setErrorMessage("");
                      }}
                      className="pl-11"
                    />
                  </div>
                </Field>

                {errorMessage && (
                  <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                    <span>{errorMessage}</span>
                  </Notice>
                )}

                <Button type="submit" size="block" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Menyimpan…
                    </>
                  ) : (
                    "Simpan Kata Sandi"
                  )}
                </Button>
              </form>
            </>
          )}
        </Card>
      </main>

      <footer className="pt-10 text-center text-[11px] text-ink-faint">© 2026 {BRAND.name}</footer>
    </div>
  );
}
