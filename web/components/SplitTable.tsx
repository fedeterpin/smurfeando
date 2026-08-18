"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import InfoTip from "@/components/InfoTip";
import RoleIcon from "@/components/RoleIcon";
import TeamLink from "@/components/TeamLink";
import { championSquare } from "@/lib/champion";
import { ROLES, formatValue } from "@/lib/stats";
import type { LivePatchRow, LiveSplitRow, LiveTournament } from "@/lib/live";
import {
  METRICS,
  type Metric,
  metricHelpKey,
  metricLabelKey,
  metricValue,
} from "@/lib/livefmt";

type SortKey = Metric | "games" | "win_rate";
const ALL = "all";

export default function SplitTable({
  tournament,
  rows,
  patches,
}: {
  tournament: LiveTournament;
  rows: LiveSplitRow[];
  patches: LivePatchRow[];
}) {
  const { t, locale } = useI18n();
  const [role, setRole] = useState(ALL);
  const [patch, setPatch] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("games");

  // Patch rows carry only numbers: identity (photo, team, slug, champion pool)
  // always comes from the split row, so filtering by patch never loses the card.
  const byPatch = useMemo(() => {
    const map = new Map<string, LivePatchRow>();
    for (const row of patches) map.set(`${row.patch} ${row.player}`, row);
    return map;
  }, [patches]);

  const shown = useMemo(() => {
    const list = rows
      .filter((r) => role === ALL || r.role === role)
      .map((row) => ({
        row,
        line: patch === ALL ? row : byPatch.get(`${patch} ${row.player}`),
      }))
      .filter((entry) => entry.line != null && entry.line.games > 0);
    list.sort((a, b) => {
      const av = a.line?.[sort] ?? -1;
      const bv = b.line?.[sort] ?? -1;
      if (av !== bv) return (bv ?? -1) - (av ?? -1);
      return a.row.player_id.localeCompare(b.row.player_id);
    });
    return list;
  }, [rows, role, patch, sort, byPatch]);

  const header = (key: SortKey, label: string, tip?: Metric, extra = "") => (
    <span className={`th-wrap th-num${extra}`} key={key}>
      <button
        type="button"
        className={`th-btn th-num${sort === key ? " active" : ""}`}
        onClick={() => setSort(key)}
      >
        {label}
        {sort === key ? " ▼" : ""}
      </button>
      {tip && <InfoTip k={metricHelpKey(tip)} align="end" />}
    </span>
  );

  return (
    <>
      <div className="controls">
        <span className="ctrl-label">{t("common.role")}</span>
        <div className="chips">
          {[ALL, ...ROLES].map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${r === role ? " active" : ""}${r === ALL ? "" : " chip-ic"}`}
              onClick={() => setRole(r)}
              aria-label={r === ALL ? t("scope.all") : r}
              aria-pressed={r === role}
              title={r === ALL ? undefined : r}
            >
              {r === ALL ? "All" : <RoleIcon role={r} />}
            </button>
          ))}
        </div>
        {tournament.patches.length > 0 && (
          <>
            <span className="ctrl-label">{t("live.patch")}</span>
            <div className="chips">
              <button
                type="button"
                className={`chip${patch === ALL ? " active" : ""}`}
                onClick={() => setPatch(ALL)}
              >
                {t("live.patchAll")}
              </button>
              {[...tournament.patches].reverse().map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip${patch === p ? " active" : ""}`}
                  onClick={() => setPatch(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty">{t("live.noRows")}</p>
      ) : (
        <div className="tbl tbl-split">
          <div className="tbl-head">
            <span className="th-lab">{t("common.player")}</span>
            <span className="th-lab col-team">{t("common.team")}</span>
            {header("games", t("common.games"))}
            <span className="th-wrap th-num col-record">
              <span className="th-lab th-num">{t("live.record")}</span>
            </span>
            {header("win_rate", t("common.winRate"), undefined, " col-wr")}
            {METRICS.map((metric) =>
              header(
                metric,
                t(metricLabelKey(metric)),
                metric,
                metric === "gpm" || metric === "vspm" ? " col-wide" : "",
              ),
            )}
            <span className="th-lab col-champs">{t("live.champions")}</span>
          </div>
          {shown.map(({ row, line }, i) => (
            <div className={`tbl-row${i === 0 ? " first" : ""}`} key={row.player}>
              <span className="pcell">
                <RoleIcon role={row.role} className="ic role sm" />
                {row.slug ? (
                  <Link href={`/players/${row.slug}`} className="pname">
                    {row.player_id}
                  </Link>
                ) : (
                  <span className="pname">{row.player_id}</span>
                )}
              </span>
              <span className="col-team" title={row.team ?? undefined}>
                <TeamLink slug={row.team_slug}>
                  {row.team_short ?? row.team ?? "—"}
                </TeamLink>
              </span>
              <span className="cell-games cell-num">{line!.games}</span>
              <span className="cell-num col-record">
                {line!.wins}
                {t("common.winShort")}–{line!.losses}
                {t("common.lossShort")}
              </span>
              <span className="cell-num col-wr">
                {line!.win_rate == null
                  ? "—"
                  : formatValue("percent", line!.win_rate, locale)}
              </span>
              {METRICS.map((metric) => (
                <span
                  className={`cell-num${metric === "gpm" || metric === "vspm" ? " col-wide" : ""}`}
                  key={metric}
                >
                  {metricValue(line, metric, locale)}
                </span>
              ))}
              <span className="col-champs cell-champs">
                {patch === ALL
                  ? row.champions.slice(0, 3).map((c) => (
                      <span
                        key={c.champion}
                        className="champ-icon sm"
                        title={`${c.champion} · ${c.games}`}
                        style={{
                          backgroundImage: `url(${championSquare(c.champion)})`,
                        }}
                      />
                    ))
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
