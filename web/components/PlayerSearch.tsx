"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlayerIndexRow } from "@/lib/db";
import { formatValue, ROLES } from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import InfoTip from "@/components/InfoTip";

// Role names are not translated (scene convention); only shortened.
const ROLE_SHORT: Record<string, string> = {
  Top: "Top",
  Jungle: "Jng",
  Mid: "Mid",
  Bot: "ADC",
  Support: "Sup",
};

const MAX_ROWS = 100;

export default function PlayerSearch({ players }: { players: PlayerIndexRow[] }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players.filter((p) => {
      if (role !== "all" && p.role !== role) return false;
      if (!needle) return true;
      return [p.display_id, p.name, p.team, p.role]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(needle));
    });
  }, [q, role, players]);

  const rows = filtered.slice(0, MAX_ROWS);

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
              placeholder={t("players.search.placeholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t("players.search.aria")}
            />
          </div>
        </div>
        <div className="chips">
          {["all", ...ROLES].map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${r === role ? " active" : ""}`}
              onClick={() => setRole(r)}
            >
              {r === "all" ? "All" : ROLE_SHORT[r] ?? r}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{t("common.noMatch", { q })}</p>
      ) : (
        <div className="tbl tbl-players">
          <div className="tbl-head">
            <span className="th-lab">{t("common.player")}</span>
            <span className="th-lab col-role">{t("common.role")}</span>
            <span className="th-lab col-team">{t("common.team")}</span>
            <span className="th-wrap th-num col-games">
              <span className="th-lab th-num">{t("common.games")}</span>
              <InfoTip k="tip.playersGames" align="end" />
            </span>
            <span className="th-wrap th-num">
              <span className="th-lab th-num">{t("common.kda")}</span>
              <InfoTip k="tip.kda" align="end" />
            </span>
            <span className="th-wrap th-num">
              <span className="th-lab th-num">{t("common.winRate")}</span>
              <InfoTip k="tip.winRate" align="end" />
            </span>
          </div>
          {rows.map((p, i) => (
            <Link
              href={`/players/${p.slug}`}
              className={`tbl-row${i === 0 ? " first" : ""}`}
              key={p.player_id}
            >
              <span className="pcell">
                <span
                  className="avatar av-30"
                  style={
                    p.image_url ? { backgroundImage: `url(${p.image_url})` } : undefined
                  }
                  aria-hidden="true"
                >
                  {!p.image_url && (p.display_id?.[0] ?? "?")}
                </span>
                <span className="pcell-id">
                  <span className="pname">{p.display_id}</span>
                  {p.intl_titles > 0 && (
                    <span className="ptag" title={t("players.card.intlTitles")}>
                      ★ {p.intl_titles}
                    </span>
                  )}
                </span>
              </span>
              <span className="cell-role col-role">{p.role ?? "—"}</span>
              <span className="cell-role col-team">{p.team ?? "—"}</span>
              <span className="cell-games cell-num col-games">{p.games}</span>
              <span className="cell-score cell-num">
                {formatValue("ratio", p.kda, locale)}
              </span>
              <span className="cell-num">
                {formatValue("percent", p.win_rate, locale)}
              </span>
            </Link>
          ))}
        </div>
      )}
      {filtered.length > MAX_ROWS && (
        <p className="tbl-count">
          {t("players.showing", { shown: MAX_ROWS, total: filtered.length })}
        </p>
      )}
    </>
  );
}
