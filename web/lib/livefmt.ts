// Shared formatting for the live-slice tables. Kept out of lib/live.ts because that
// one reads the filesystem at build time and must never end up in a client bundle
// (only its types are imported here, and types are erased).
import { formatValue } from "@/lib/stats";
import type { Locale, MsgKey } from "@/lib/i18n/messages";

/** The columns a scout reads, in the order gol.gg-style tables show them. */
export const METRICS = ["kda", "kp", "cspm", "dpm", "gpm", "vspm"] as const;
export type Metric = (typeof METRICS)[number];

export const metricLabelKey = (m: Metric) => `live.metric.${m}` as MsgKey;
export const metricHelpKey = (m: Metric) => `live.metric.${m}.help` as MsgKey;

/** Any row that carries the metrics: the full split line or the home's trimmed one. */
type MetricSource = Partial<Record<Metric, number | null>>;

export function metricValue(
  line: MetricSource | null | undefined,
  metric: Metric,
  locale: Locale,
): string {
  const value = line?.[metric];
  if (value == null) return "—";
  if (metric === "kp") return formatValue("percent", value, locale);
  if (metric === "dpm" || metric === "gpm")
    return formatValue("count", value, locale);
  return formatValue("ratio", value, locale);
}

/** Cargo timestamps are UTC without a zone marker; make that explicit. */
export const parseUtc = (stamp: string): Date =>
  new Date(`${stamp.replace(" ", "T")}Z`);

/** YYYY-MM-DD in the given zone (undefined = the reader's own). */
export const dayKey = (date: Date, timeZone?: string): string =>
  date.toLocaleDateString("en-CA", { timeZone });

export const winLoss = (line: { wins: number; losses: number }): string =>
  `${line.wins}-${line.losses}`;
