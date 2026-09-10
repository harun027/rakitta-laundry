"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Clock, ShieldAlert, ArrowRight, X } from "lucide-react";

/* =============================================================================
   PRD §7.5 FR37 & §19.2 — Subscription Status & Entitlement Banner.
   Shows active Trial count, Grace Period warnings, and Restricted state notice.
   ============================================================================= */

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "GRACE_PERIOD" | "RESTRICTED";

export function SubscriptionBanner({
  status = "TRIAL",
  daysRemaining = 14,
}: {
  status?: SubscriptionStatus;
  daysRemaining?: number;
}) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed && status === "TRIAL") return null;

  if (status === "RESTRICTED") {
    return (
      <div className="bg-red-600 text-white px-6 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            <strong>Akun Dibatasi (Restricted):</strong> Pembuatan order baru dinonaktifkan. Anda tetap dapat menyelesaikan produksi, mencatat pelunasan, dan menyerahkan order yang sedang berjalan.
          </span>
        </div>
        <Link
          href="/settings"
          className="px-3.5 py-1 rounded-full bg-white text-red-700 font-bold hover:bg-neutral-100 flex items-center gap-1 shrink-0"
        >
          Aktifkan Langganan <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  if (status === "GRACE_PERIOD") {
    return (
      <div className="bg-amber-500 text-black px-6 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <strong>Masa Tenggang (Grace Period):</strong> Tersisa {daysRemaining} hari sebelum pembuatan order baru dikunci. Segera perpanjang paket outlet Anda.
          </span>
        </div>
        <Link
          href="/settings"
          className="px-3.5 py-1 rounded-full bg-black text-white font-bold hover:bg-neutral-800 flex items-center gap-1 shrink-0"
        >
          Perpanjang <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  if (status === "TRIAL" && daysRemaining <= 5) {
    return (
      <div className="bg-neutral-900 text-white px-6 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-[#FFE600] shrink-0" />
          <span>
            Masa Percobaan Trial Gratis tersisa <strong className="text-[#FFE600]">{daysRemaining} hari</strong>.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-[#FFE600] hover:underline font-bold"
          >
            Pilih Paket Mulai Rp 79rb &rarr;
          </Link>
          <button onClick={() => setDismissed(true)} className="text-neutral-400 hover:text-white">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
