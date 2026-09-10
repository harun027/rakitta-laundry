"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageBody, PageShell } from "@/components/ui/layout";
import { Notice } from "@/components/ui/stat";
import { Logo } from "@/components/ui/logo";
import { apiFetch } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

/* =============================================================================
   FR02 — invitation acceptance. The token in the URL is only ever sent to our
   own Route Handler over HTTPS; it is never written to a log, and the table
   behind it stores only its SHA-256 hash. A person who does not have an
   account yet with the invited email creates one here, then the same click
   redeems the invitation.
   ============================================================================= */

type Step = "checking" | "need_auth" | "accepting" | "accepted" | "error";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_up");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // §13.3 — one key for this page load, reused if acceptance is retried; the
  // raw token itself is never used as a key or written anywhere else.
  const acceptKeyRef = useRef<string>(crypto.randomUUID());

  const acceptInvitation = async () => {
    setStep("accepting");
    setErrorMessage("");
    try {
      await apiFetch("/api/staff/accept", {
        method: "POST",
        idempotencyKey: acceptKeyRef.current,
        body: JSON.stringify({ token }),
      });
      setStep("accepted");
      setTimeout(() => router.push("/"), 1500);
    } catch (error) {
      setErrorMessage(messageOf(error, "Undangan tidak dapat diterima."));
      setStep("error");
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        acceptInvitation();
      } else {
        setStep("need_auth");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } =
        mode === "sign_up"
          ? await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: { data: { full_name: fullName.trim() } },
            })
          : await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (error) {
        setErrorMessage(error.message || "Autentikasi gagal.");
        setBusy(false);
        return;
      }
      await acceptInvitation();
    } catch (error) {
      setErrorMessage(messageOf(error, "Autentikasi gagal."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <PageBody width="narrow" className="flex min-h-screen items-center justify-center py-16">
        <Card className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3">
            <Logo height={28} />
            <span className="eyebrow">Undangan Staf</span>
          </div>

          {step === "checking" && (
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Memeriksa sesi Anda…
            </div>
          )}

          {step === "accepting" && (
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Memproses undangan…
            </div>
          )}

          {step === "accepted" && (
            <Notice tone="success" icon={<CheckCircle2 className="size-4" />}>
              <p className="font-bold">Undangan diterima</p>
              <p>Anda akan diarahkan ke halaman utama sebentar lagi.</p>
            </Notice>
          )}

          {step === "error" && (
            <>
              <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                {errorMessage}
              </Notice>
              <Button variant="outline" className="w-full" onClick={() => setStep("need_auth")}>
                Coba Lagi
              </Button>
            </>
          )}

          {step === "need_auth" && (
            <>
              <p className="text-sm text-ink-muted">
                Masuk atau buat akun dengan email yang diundang untuk mengaktifkan akses staf ini.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("sign_up")}
                  className={`h-10 flex-1 rounded-full text-xs font-bold ${
                    mode === "sign_up" ? "bg-ink text-white" : "border border-line text-ink-muted"
                  }`}
                >
                  Buat Akun Baru
                </button>
                <button
                  type="button"
                  onClick={() => setMode("sign_in")}
                  className={`h-10 flex-1 rounded-full text-xs font-bold ${
                    mode === "sign_in" ? "bg-ink text-white" : "border border-line text-ink-muted"
                  }`}
                >
                  Sudah Punya Akun
                </button>
              </div>

              <form onSubmit={submitAuth} className="space-y-4">
                {errorMessage && (
                  <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
                    {errorMessage}
                  </Notice>
                )}
                {mode === "sign_up" && (
                  <Field label="Nama Lengkap" required>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </Field>
                )}
                <Field label="Email" required hint="Harus sama dengan email yang diundang.">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Kata Sandi" required>
                  <Input
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  <ShieldCheck className="size-4" />
                  {busy ? "Memproses…" : "Terima Undangan"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </PageBody>
    </PageShell>
  );
}
