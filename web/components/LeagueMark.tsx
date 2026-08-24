import type { CSSProperties } from "react";
import { thumb } from "@/lib/icons";

/**
 * A league wordmark, painted as a silhouette in the site's ink.
 *
 * The wiki hosts one logo per rebrand and the ETL picks the one for the season
 * being played, but most of them are pure black artwork drawn for a white page
 * and the wiki has no dark-mode variant: on the navy panel they measure ~1.1:1,
 * which is invisible, not merely faint. So the artwork is used as a MASK rather
 * than an image and the colour comes from `--league-ink` — every league reads
 * the same, with nothing behind it, and one added later can never turn up blank.
 *
 * That trade is only sound because the ETL guarantees the artwork is a real
 * cut-out (`etl/imageprobe.py`); a logo baked onto a solid background would
 * paint as a slab, so `league_logo` returns null for those and the caller shows
 * the league's short name instead.
 */
export default function LeagueMark({
  logo,
  label,
  title,
  size = "sm",
}: {
  logo: string;
  label?: string | null;
  title?: string | null;
  size?: "sm" | "lg";
}) {
  // 2x the CSS slot (56px, and 128px for the page header) for retina.
  const url = thumb(logo, size === "lg" ? 256 : 112);
  if (!url) return null;
  return (
    <span
      className={size === "lg" ? "league-mark lg" : "league-mark"}
      style={{ "--league-mark": `url(${url})` } as CSSProperties}
      role="img"
      aria-label={label ?? undefined}
      title={title ?? undefined}
    />
  );
}
