/* Single place for product identity. PRD v1.3 ships under the working name
 * "LaundryFlow" and states that trademark/domain were never checked — so the
 * name lives here, changeable in one edit. */

export const BRAND = {
  name: "Rakita",
  mark: "RK",
  /** PRD §1.2 positioning, verbatim intent. */
  positioning:
    "Satu tempat untuk mencatat cucian, menemukan paket, memeriksa pembayaran, dan menutup kas harian.",
  tagline: "Operasi laundry yang bisa ditelusuri",
  /** PRD front matter: this is a specification, not a shipped product. */
  status: "Spesifikasi PRD v1.3 · Prototipe operasional",
  docVersion: "PRD & Analisis Sistem v1.3 · 10 September 2026",
} as const;
