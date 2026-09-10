"use client";

import * as React from "react";
import { formatRupiah, formatWeight } from "@/lib/utils";
import { Printer, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/* =============================================================================
   PRD §7.2 FR14 & §14.3 — Thermal Receipt Component (58mm / 80mm).
   Renders an authentic, crisp receipt layout for cashier POS printers.
   ============================================================================= */

export interface ThermalReceiptProps {
  orderNumber: string;
  acceptedAt: string;
  promisedAt: string;
  customerName: string;
  customerPhone?: string | null;
  outletName: string;
  outletAddress?: string;
  outletPhone?: string;
  lines: Array<{
    serviceName: string;
    unit: "kg" | "piece";
    actualQuantity: number;
    billableQuantity: number;
    ratePerUnitIdr: number;
    subtotalIdr: number;
  }>;
  subtotalIdr: number;
  discountIdr: number;
  totalChargesIdr: number;
  paidAmountIdr: number;
  balanceIdr: number;
  paymentMethod: string;
  tenderedIdr?: number;
  changeIdr?: number;
  bagCodes?: string[];
  rackCode?: string;
  cashierName?: string;
}

export function ThermalReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ThermalReceiptProps;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden max-w-sm w-full">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-neutral-50 no-print">
          <div className="flex items-center gap-2">
            <Printer className="size-4 text-neutral-700" />
            <span className="text-xs font-bold text-neutral-900">Pratinjau Struk Thermal</span>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Printable Receipt Area */}
        <div className="overflow-y-auto p-4 flex justify-center bg-neutral-100">
          <div
            id="thermal-receipt"
            className="w-[280px] bg-white p-4 font-mono text-[11px] leading-tight text-black shadow-sm border border-neutral-200"
          >
            {/* Outlet Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-black">
              <div className="text-sm font-black tracking-wider uppercase">{receipt.outletName}</div>
              {receipt.outletAddress && <div className="text-[10px] text-neutral-600">{receipt.outletAddress}</div>}
              {receipt.outletPhone && <div className="text-[10px]">WA: {receipt.outletPhone}</div>}
            </div>

            {/* Transaction Info */}
            <div className="py-2.5 space-y-1 text-[10px] border-b border-dashed border-black">
              <div className="flex justify-between">
                <span>NO:</span>
                <span className="font-bold">{receipt.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>TGL:</span>
                <span>{new Date(receipt.acceptedAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <div className="flex justify-between">
                <span>PLG:</span>
                <span className="font-bold truncate max-w-[150px]">{receipt.customerName}</span>
              </div>
              {receipt.customerPhone && (
                <div className="flex justify-between">
                  <span>TEL:</span>
                  <span>{receipt.customerPhone}</span>
                </div>
              )}
              {receipt.cashierName && (
                <div className="flex justify-between">
                  <span>KASIR:</span>
                  <span>{receipt.cashierName}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="py-2.5 space-y-2 border-b border-dashed border-black">
              {receipt.lines.map((l, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="font-bold">{l.serviceName}</div>
                  <div className="flex justify-between text-[10px] text-neutral-700">
                    <span>
                      {l.unit === "kg"
                        ? `${formatWeight(l.actualQuantity)} (Tagih ${formatWeight(l.billableQuantity)}) x ${formatRupiah(l.ratePerUnitIdr)}`
                        : `${l.actualQuantity} pcs x ${formatRupiah(l.ratePerUnitIdr)}`}
                    </span>
                    <span className="font-bold text-black">{formatRupiah(l.subtotalIdr)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals & Money */}
            <div className="py-2.5 space-y-1 text-[10px] border-b border-dashed border-black">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>{formatRupiah(receipt.subtotalIdr)}</span>
              </div>
              {receipt.discountIdr > 0 && (
                <div className="flex justify-between">
                  <span>DISKON:</span>
                  <span>-{formatRupiah(receipt.discountIdr)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-black">
                <span>TOTAL (C):</span>
                <span>{formatRupiah(receipt.totalChargesIdr)}</span>
              </div>
              <div className="flex justify-between">
                <span>BAYAR ({receipt.paymentMethod}):</span>
                <span>{formatRupiah(receipt.paidAmountIdr)}</span>
              </div>
              {receipt.changeIdr !== undefined && receipt.changeIdr > 0 && (
                <div className="flex justify-between">
                  <span>KEMBALI:</span>
                  <span>{formatRupiah(receipt.changeIdr)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-dotted border-black">
                <span>SISA TAGIHAN:</span>
                <span>{receipt.balanceIdr === 0 ? "LUNAS" : formatRupiah(receipt.balanceIdr)}</span>
              </div>
            </div>

            {/* SLA Promise & Bag Tags */}
            <div className="py-2.5 space-y-1 text-[10px] border-b border-dashed border-black">
              <div className="flex justify-between">
                <span className="font-bold">JANJI SELESAI:</span>
              </div>
              <div className="font-bold text-center text-xs py-0.5 bg-neutral-100">
                {new Date(receipt.promisedAt).toLocaleString("id-ID", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {receipt.bagCodes && receipt.bagCodes.length > 0 && (
                <div className="pt-1 flex justify-between text-[9px]">
                  <span>KANTONG:</span>
                  <span className="font-bold">{receipt.bagCodes.join(", ")}</span>
                </div>
              )}
              {receipt.rackCode && (
                <div className="flex justify-between text-[9px]">
                  <span>RAK SIMPAN:</span>
                  <span className="font-bold">{receipt.rackCode}</span>
                </div>
              )}
            </div>

            {/* Footer / Terms */}
            <div className="text-center pt-3 text-[9px] text-neutral-600 space-y-1">
              <div>Simpan struk ini sebagai bukti sah pengambilan.</div>
              <div>Terima kasih atas kepercayaan Anda!</div>
              <div className="pt-1 font-bold">--- LaundryFlow SaaS ---</div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t bg-white flex gap-2 no-print">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Tutup
          </Button>
          <Button className="flex-1 bg-black text-white hover:bg-neutral-800" onClick={handlePrint}>
            <Printer className="size-4 mr-1.5" /> Cetak Struk
          </Button>
        </div>
      </div>
    </div>
  );
}
