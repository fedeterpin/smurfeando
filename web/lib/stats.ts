// Catalog of leaderboards/records: how each one is shown and formatted.
// The human-readable copy (label, short header, help text) lives in
// lib/i18n/messages.ts under `stat.<key>.*` so it can be translated; this file
// only keeps what is structural.
import { DEFAULT_LOCALE, type Locale, type MsgKey } from "@/lib/i18n/messages";

// Boards split into two universes because the underlying data does. `intl` reads
// Leaguepedia (Worlds/MSI/First Stand) and slices by role; `regional` reads Oracle's
// Elixir (domestic leagues) and slices by region. The gold layer has no combination
// of the two — there is no region:korea + role:Top — so a board belongs to one
// universe at a time, and several stats exist in both with different numbers.
export type Universe = "intl" | "regional";

export interface StatDef {
  key: string;
  kind: "ratio" | "count" | "percent";
  universes: Universe[];
  roleScoped?: boolean; // per-role variants in the intl universe (scope = role:Top, …)
  signed?: boolean; // show an explicit + on positive values (gold difference)
  coverage?: boolean; // the source does not cover every game; render stat.<key>.coverage
}

export const STAT_CATALOG: StatDef[] = [
  { key: "legacy_score", kind: "count", universes: ["intl"] },
  { key: "career_kda", kind: "ratio", universes: ["intl", "regional"], roleScoped: true },
  { key: "career_kda_intl", kind: "ratio", universes: ["intl"] },
  { key: "intl_titles", kind: "count", universes: ["intl"] },
  { key: "worlds_titles", kind: "count", universes: ["intl"] },
  { key: "msi_titles", kind: "count", universes: ["intl"] },
  { key: "worlds_appearances", kind: "count", universes: ["intl"] },
  { key: "games_played", kind: "count", universes: ["intl", "regional"], roleScoped: true },
  { key: "career_kills", kind: "count", universes: ["intl", "regional"], roleScoped: true },
  { key: "win_rate", kind: "percent", universes: ["intl", "regional"], roleScoped: true },
  // Oracle's Elixir only — Leaguepedia's Cargo tables carry none of these.
  { key: "gd15", kind: "count", universes: ["regional"], signed: true },
  { key: "gold15", kind: "count", universes: ["regional"] },
  { key: "cs_per_min", kind: "ratio", universes: ["regional"] },
  { key: "dpm", kind: "count", universes: ["regional"] },
  { key: "pentakills", kind: "count", universes: ["regional"], coverage: true },
];

export const statsFor = (u: Universe) =>
  STAT_CATALOG.filter((s) => s.universes.includes(u));

// The board a universe starts on, and the scope key for "no slice selected".
export const baseScope = (u: Universe) => (u === "intl" ? "all" : "regional");

export const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(
  STAT_CATALOG.map((s) => [s.key, s]),
);

// Stat keys are data-driven (they come from the gold tables), so message keys
// are built at runtime; every catalog entry has all three in messages.ts.
export const statLabelKey = (key: string) => `stat.${key}.label` as MsgKey;
export const statShortKey = (key: string) => `stat.${key}.short` as MsgKey;
export const statHelpKey = (key: string) => `stat.${key}.help` as MsgKey;
// Only defined for entries flagged `coverage`.
export const statCoverageKey = (key: string) => `stat.${key}.coverage` as MsgKey;

export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

// Role names are not translated (scene convention); only shortened. Used as the
// text fallback wherever the role icon is unavailable.
export const ROLE_SHORT: Record<string, string> = {
  all: "All",
  Top: "Top",
  Jungle: "JG",
  Mid: "Mid",
  Bot: "ADC",
  Support: "Sup",
};

export function formatValue(
  kind: StatDef["kind"],
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  signed = false,
): string {
  if (value == null) return "—";
  if (kind === "ratio")
    return value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (kind === "percent")
    return `${(value * 100).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  const n = Math.round(value);
  // A gold difference reads as a lane result, so the sign carries the meaning:
  // "+562" is a won lane, "562" looks like an absolute amount of gold.
  return `${signed && n > 0 ? "+" : ""}${n.toLocaleString(locale)}`;
}
