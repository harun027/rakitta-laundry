import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/* One place that knows which logo file goes on which background.
 * Wordmarks are 1278×375 (3.41:1); the square mark is 1254×1254. */

/* Intrinsic file sizes. next/image wants the source dimensions in the props and
 * the display size in CSS — passing a rounded display width instead makes it
 * warn that only one axis was modified. */
const WORDMARK = { width: 1278, height: 375 };
const MARK = { width: 1254, height: 1254 };

/**
 * Full wordmark. `tone="dark"` is the white-text variant for dark surfaces —
 * pick it by the surface the logo sits on, not by the viewer's theme.
 */
export function Logo({
  tone = "light",
  height = 32,
  className,
  priority,
}: {
  tone?: "light" | "dark";
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={tone === "dark" ? BRAND.logo.wordmarkDark : BRAND.logo.wordmarkLight}
      alt={BRAND.name}
      width={WORDMARK.width}
      height={WORDMARK.height}
      priority={priority}
      className={cn("object-contain", className)}
      // Both axes in one place, otherwise next/image warns about the ratio.
      style={{ height, width: "auto" }}
    />
  );
}

/** Square app mark, for avatars, badges, and anywhere the wordmark is too wide. */
export function LogoMark({
  size = 40,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={BRAND.logo.mark}
      alt=""
      aria-hidden
      width={MARK.width}
      height={MARK.height}
      priority={priority}
      className={cn("shrink-0 rounded-[22%] object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
