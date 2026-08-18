"use client";

import { useState } from "react";
import Link from "next/link";
import type { LeaderboardRow, RegionRow } from "@/lib/db";
import {
  baseScope,
  formatValue,
  statCoverageKey,
  statHelpKey,
  statLabelKey,
  statShortKey,
  statsFor,
  ROLES,
  type StatDef,
  type Universe,
} from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import { thumb } from "@/lib/icons";
import type { MsgKey } from "@/lib/i18n/messages";
import InfoTip from "@/components/InfoTip";
import RoleIcon from "@/components/RoleIcon";
import TeamLink from "@/components/TeamLink";

const RANK_WORDS: MsgKey[] = ["podium.first", "podium.second", "podium.third"];

type SortCol = "rank" | "value" | "games";
interface SortState {
  col: SortCol;
  desc: boolean;
}

const DEFAULT_SORT: SortState = { col: "rank", desc: false };
const COLLAPSED_ROWS = 17; // ranks 4–20 while the table is collapsed

function Avatar({ row, size }: { row: LeaderboardRow; size: 30 | 56 | 68 }) {
  return (
    <span
      className={`avatar av-${size}`}
      style={
        row.image_url
          ? { backgroundImage: `url(${thumb(row.image_url, size * 2)})` }
          : undefined
      }
      aria-hidden="true"
    >
      {!row.image_url && (row.display_id?.[0] ?? "?")}
    </span>
  );
}

function PodiumCard({ row, def }: { row: LeaderboardRow; def: StatDef }) {
  const { t, locale } = useI18n();
  const pos = row.rank;
  const body = (
    <span className="cutp-in">
      <span className="podium-rankword">{t(RANK_WORDS[pos - 1])}</span>
      <Avatar row={row} size={pos === 1 ? 68 : 56} />
      <span className="podium-name">{row.display_id}</span>
      {(row.role || row.team) && (
        <span className="podium-meta">
          {row.role && <RoleIcon role={row.role} className="ic role sm" />}
          {row.team && (
            <TeamLink nested slug={row.team_slug}>
              {row.team}
            </TeamLink>
          )}
        </span>
      )}
      <span className={`podium-score${pos === 1 ? " gold-text" : ""}`}>
        {formatValue(def.kind, row.value, locale, def.signed)}
      </span>
      {pos === 1 && <span className="podium-unit">{t(statShortKey(def.key))}</span>}
    </span>
  );
  const cls = `cutp podium-card p${pos}${pos === 1 ? " featured" : ""}`;
  return row.slug ? (
    <Link href={`/players/${row.slug}`} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export default function LeaderboardExplorer({
  boards,
  catalog,
  regions,
}: {
  boards: Record<string, Record<string, LeaderboardRow[]>>;
  catalog: StatDef[];
  regions: RegionRow[];
}) {
  const { t, locale } = useI18n();
  // The two universes are separate worlds: international boards come from
  // Leaguepedia and slice by role, regional ones from Oracle's Elixir and slice by
  // region. Several stats exist in both with different numbers, so the universe has
  // to be picked before the category means anything.
  const [universe, setUniverse] = useState<Universe>("intl");
  const [statKey, setStatKey] = useState(statsFor("intl")[0]?.key ?? "");
  const [role, setRole] = useState("all");
  const [region, setRegion] = useState("all");
  const [expanded, setExpanded] = useState(false);
  // Sort direction persists per category.
  const [sortMap, setSortMap] = useState<Record<string, SortState>>({});

  const shown = catalog.filter((s) => s.universes.includes(universe));
  const def = shown.find((s) => s.key === statKey) ?? shown[0];

  const switchUniverse = (u: Universe) => {
    setUniverse(u);
    setExpanded(false);
    // Keep the category when the stat exists in both universes (career KDA stays
    // career KDA); otherwise fall back to that universe's first board.
    const stays = catalog.find((s) => s.key === statKey)?.universes.includes(u);
    if (!stays) setStatKey(statsFor(u)[0]?.key ?? "");
  };

  const effScope =
    universe === "intl"
      ? def?.roleScoped && role !== "all"
        ? `role:${role}`
        : "all"
      : region === "all"
        ? baseScope("regional")
        : `region:${region}`;
  const data = boards[statKey]?.[effScope] ?? [];
  const sort = sortMap[statKey] ?? DEFAULT_SORT;

  const podium = data.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  const rest = data
    .filter((r) => r.rank > 3)
    .sort((a, b) => {
      const av = (a[sort.col] ?? -Infinity) as number;
      const bv = (b[sort.col] ?? -Infinity) as number;
      return sort.desc ? bv - av : av - bv;
    });
  const rows = expanded ? rest : rest.slice(0, COLLAPSED_ROWS);

  const toggleSort = (col: SortCol) => {
    setSortMap((m) => {
      const prev = m[statKey] ?? DEFAULT_SORT;
      const next: SortState =
        prev.col === col ? { col, desc: !prev.desc } : { col, desc: col !== "rank" };
      return { ...m, [statKey]: next };
    });
  };

  const arrow = (col: SortCol) => (sort.col === col ? (sort.desc ? " ▼" : " ▲") : "");

  const boardKey = `${statKey}:${effScope}`;

  return (
    <>
      {podium.length > 0 && (
        <div key={`podium-${boardKey}`} className="podium fade-swap">
          {[podium[1], podium[0], podium[2]]
            .filter((r): r is LeaderboardRow => Boolean(r))
            .map((r) => (
              <PodiumCard key={r.player_id} row={r} def={def} />
            ))}
        </div>
      )}

      <div className="lb-layout">
        <aside className="rail">
          <div className="rail-group">
            <p className="rail-label">{t("leaderboards.scope")}</p>
            <div className="chips">
              {(["intl", "regional"] as Universe[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`chip${u === universe ? " active" : ""}`}
                  onClick={() => switchUniverse(u)}
                >
                  {t(`leaderboards.universe.${u}` as MsgKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="rail-group categories">
            <p className="rail-label">{t("leaderboards.category")}</p>
            <div className="rail-items">
              {shown.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`rail-item${s.key === statKey ? " active" : ""}`}
                  onClick={() => {
                    setStatKey(s.key);
                    setExpanded(false);
                  }}
                >
                  {t(statLabelKey(s.key))}
                </button>
              ))}
            </div>
          </div>

          {universe === "intl" && def?.roleScoped && (
            <div className="rail-group">
              <p className="rail-label">{t("leaderboards.role")}</p>
              <div className="chips">
                {["all", ...ROLES].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`chip${r === role ? " active" : ""}${r === "all" ? "" : " chip-ic"}`}
                    onClick={() => {
                      setRole(r);
                      setExpanded(false);
                    }}
                    aria-label={r === "all" ? t("scope.all") : r}
                    aria-pressed={r === role}
                    title={r === "all" ? undefined : r}
                  >
                    {r === "all" ? "All" : <RoleIcon role={r} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {universe === "regional" && regions.length > 0 && (
            <div className="rail-group">
              <p className="rail-label">{t("leaderboards.region")}</p>
              <div className="chips">
                <button
                  type="button"
                  className={`chip${region === "all" ? " active" : ""}`}
                  onClick={() => {
                    setRegion("all");
                    setExpanded(false);
                  }}
                >
                  {t("leaderboards.allRegions")}
                </button>
                {regions.map((r) => (
                  <button
                    key={r.region}
                    type="button"
                    className={`chip${r.region === region ? " active" : ""}`}
                    onClick={() => {
                      setRegion(r.region);
                      setExpanded(false);
                    }}
                  >
                    {r.region_label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {def && <p className="rail-note">{t(statHelpKey(def.key))}</p>}
          {def?.coverage && (
            <p className="rail-note caveat">{t(statCoverageKey(def.key))}</p>
          )}
          {universe === "regional" && (
            <p className="rail-note">{t("leaderboards.regionalSource")}</p>
          )}
        </aside>

        {data.length === 0 ? (
          <p className="empty">{t("leaderboards.empty")}</p>
        ) : (
          <div key={boardKey} className="tbl fade-swap">
            <div className="tbl-head">
              <button
                type="button"
                className={`th-btn${sort.col === "rank" ? " active" : ""}`}
                onClick={() => toggleSort("rank")}
              >
                #{arrow("rank")}
              </button>
              <span className="th-lab">{t("common.player")}</span>
              <span className="th-lab col-role">{t("common.role")}</span>
              <button
                type="button"
                className={`th-btn th-num${sort.col === "value" ? " active" : ""}`}
                onClick={() => toggleSort("value")}
              >
                {t(statShortKey(def.key))}
                {arrow("value")}
              </button>
              <span className="th-wrap th-num col-games">
                <button
                  type="button"
                  className={`th-btn th-num${sort.col === "games" ? " active" : ""}`}
                  onClick={() => toggleSort("games")}
                >
                  {t("common.games")}
                  {arrow("games")}
                </button>
                <InfoTip k="tip.games" align="end" />
              </span>
            </div>

            {rows.map((r, i) => {
              const cells = (
                <>
                  <span className={`cell-rank${r.rank <= 10 ? " hot" : ""}`}>
                    {r.rank}
                  </span>
                  <span className="pcell">
                    <Avatar row={r} size={30} />
                    <span className="pcell-id">
                      <span className="pname">{r.display_id}</span>
                      {r.team && (
                        <TeamLink nested slug={r.team_slug} className="ptag">
                          {r.team}
                        </TeamLink>
                      )}
                    </span>
                  </span>
                  <span className="cell-role col-role">
                    <RoleIcon role={r.role} />
                  </span>
                  <span className="cell-score cell-num">
                    {formatValue(def.kind, r.value, locale, def.signed)}
                  </span>
                  <span className="cell-games cell-num col-games">{r.games ?? "—"}</span>
                </>
              );
              const cls = `tbl-row${i === 0 ? " first" : ""}`;
              return r.slug ? (
                <Link key={r.player_id} href={`/players/${r.slug}`} className={cls}>
                  {cells}
                </Link>
              ) : (
                <div key={r.player_id} className={cls}>
                  {cells}
                </div>
              );
            })}

            {rest.length > COLLAPSED_ROWS && (
              <div className="tbl-foot">
                <button type="button" onClick={() => setExpanded(!expanded)}>
                  {expanded
                    ? t("leaderboards.showTop")
                    : t("leaderboards.showAll", { n: data.length })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
