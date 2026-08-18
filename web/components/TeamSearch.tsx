"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TeamIndexRow } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { thumb } from "@/lib/icons";

const PAGE_SIZE = 100;

export default function TeamSearch({ teams }: { teams: TeamIndexRow[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((team) =>
      [team.name, team.team_id, team.short, team.region]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(needle)),
    );
  }, [q, teams]);

  const rows = filtered.slice(0, shown);

  return (
    <>
      <div className="players-tools">
        <div className="cutp cut14 search-frame">
          <div className="cutp-in">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="search-input"
              type="search"
              placeholder={t("teams.search.placeholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(PAGE_SIZE);
              }}
              aria-label={t("teams.search.aria")}
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{t("teams.noMatch", { q })}</p>
      ) : (
        <div className="tbl tbl-teams">
          <div className="tbl-head">
            <span className="th-lab">{t("common.team")}</span>
            <span className="th-lab col-region">{t("leaderboards.region")}</span>
            <span className="th-lab th-num">{t("teams.col.titles")}</span>
            <span className="th-lab th-num col-podiums">{t("teams.col.podiums")}</span>
            <span className="th-lab th-num col-games">{t("common.games")}</span>
            <span className="th-lab th-num col-years">{t("teams.col.years")}</span>
          </div>
          {rows.map((team, i) => (
            <Link
              href={`/teams/${team.slug}`}
              className={`tbl-row${i === 0 ? " first" : ""}`}
              key={team.team_id}
            >
              <span className="pcell">
                <span
                  className="avatar av-30 sq"
                  style={
                    team.logo_url
                      ? { backgroundImage: `url(${thumb(team.logo_url, 60)})` }
                      : undefined
                  }
                  aria-hidden="true"
                >
                  {!team.logo_url && (team.name?.[0] ?? "?")}
                </span>
                <span className="pcell-id">
                  <span className="pname">{team.name}</span>
                </span>
              </span>
              <span className="cell-role col-region">{team.region ?? "—"}</span>
              <span className="cell-num">
                {team.titles > 0 ? (
                  <span className="ptag" title={t("teams.col.titles")}>
                    ★ {team.titles}
                  </span>
                ) : (
                  "—"
                )}
              </span>
              <span className="cell-num col-podiums">
                {team.podiums > 0 ? team.podiums : "—"}
              </span>
              <span className="cell-games cell-num col-games">{team.games}</span>
              <span className="cell-num col-years">
                {team.first_year === team.last_year
                  ? team.first_year
                  : `${team.first_year}–${team.last_year}`}
              </span>
            </Link>
          ))}
        </div>
      )}
      {filtered.length > rows.length && (
        <div className="tbl-more">
          <p className="tbl-count">
            {t("common.showing", { shown: rows.length, total: filtered.length })}
          </p>
          <button
            type="button"
            className="chip more-btn"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            {t("common.showMore", {
              n: Math.min(PAGE_SIZE, filtered.length - rows.length),
            })}
          </button>
        </div>
      )}
    </>
  );
}
