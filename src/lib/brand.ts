/* Single place for product identity. PRD v1.3 ships under the working name
 * "LaundryFlow" and states that trademark/domain were never checked — so the
 * name lives here, changeable in one edit. */

export const BRAND = {
  name: "Rakkita",
  mark: "RK",
  /** Files in public/assets. Pick the variant by the surface, not the theme. */
  logo: {
    wordmarkLight: "/assets/logo-rakkita-light.png", // black text — light surfaces
    wordmarkDark: "/assets/logo-rakkita-dark.png", // white text — dark surfaces
    mark: "/assets/logo-rakkita.png", // square app icon
  },
  /** PRD §1.2 positioning, verbatim intent. */
  positioning:
    "Satu tempat untuk mencatat cucian, menemukan paket, memeriksa pembayaran, dan menutup kas harian.",
  tagline: "Operasi laundry yang bisa ditelusuri",
  /** PRD front matter: this is a specification, not a shipped product. */
  status: "Sistem Operasional Aktif · Rakkita",
  docVersion: "Versi 1.3 · Rilis Produksi",
} as const;
