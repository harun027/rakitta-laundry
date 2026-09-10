import { formatRupiah } from "../utils.ts";

/* =============================================================================
   PRD §7.5 FR34 & FR35 — Manual WhatsApp message generation & follow-up queue.
   Generates prefilled wa.me URLs. Clicking opens WhatsApp; never claims automated delivery.
   ============================================================================= */

export interface OrderNotificationInfo {
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  outletName: string;
  serviceSummary: string;
  balanceIdr: number;
  trackingToken?: string;
}

export function buildIntakeWhatsAppMessage(info: OrderNotificationInfo): string {
  const trackingUrl = info.trackingToken
    ? `\nLacak status laundry Anda secara online di:\nhttps://rakkita.id/t/${info.trackingToken}`
    : "";

  return (
    `Halo ${info.customerName}, terima kasih telah mempercayakan pakaian Anda di ${info.outletName}.\n\n` +
    `No. Struk: *${info.orderNumber}*\n` +
    `Layanan: ${info.serviceSummary}\n` +
    `Sisa Tagihan: *${info.balanceIdr === 0 ? "LUNAS" : formatRupiah(info.balanceIdr)}*` +
    `${trackingUrl}\n\n` +
    `Kami akan mengabari Anda kembali saat cucian siap diambil!`
  );
}

export function buildReadyWhatsAppMessage(info: OrderNotificationInfo, rackCode?: string): string {
  const rackNote = rackCode ? ` (Lokasi Rak: ${rackCode})` : "";
  const paymentNote =
    info.balanceIdr > 0
      ? `\nSisa pembayaran: *${formatRupiah(info.balanceIdr)}* (dapat dilunasi saat pengambilan).`
      : `\nStatus tagihan: *LUNAS*.`;

  return (
    `Halo ${info.customerName}, cucian Anda di ${info.outletName} dengan No. Struk *${info.orderNumber}* sudah *SELESAI & SIAP DIAMBIL*!${rackNote}\n` +
    paymentNote +
    `\n\nSilakan datang ke outlet kami pada jam operasional. Terima kasih!`
  );
}

export function buildUncollectedReminderWhatsAppMessage(info: OrderNotificationInfo, daysUncollected: number): string {
  return (
    `Halo ${info.customerName}, kami mengingatkan cucian Anda di ${info.outletName} (No. Struk *${info.orderNumber}*) telah siap diambil sejak *${daysUncollected} hari yang lalu*.\n\n` +
    `Sisa Tagihan: *${info.balanceIdr === 0 ? "LUNAS" : formatRupiah(info.balanceIdr)}*\n\n` +
    `Mohon segera diambil di outlet pada jam operasional. Terima kasih!`
  );
}

export function generateWhatsAppUrl(phone: string, text: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}
