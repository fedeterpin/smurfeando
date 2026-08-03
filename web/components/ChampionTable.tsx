"use client";

import { useMemo, useState } from "react";
import type { ChampionStatRow } from "@/lib/db";
import { championSquare } from "@/lib/champion";
import { formatValue, ROLES } from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";
import InfoTip from "@/components/InfoTip";

type SortKey = "games" | "win_rate" | "kda";
const MIN_OPTIONS = [1, 20, 50, 100];

// Role names are not translated (scene convention); only shortened.
const ROLE_SHORT: Record<string, string> = {
  all: "All",
  Top: "Top",
  Jungle: "Jng",
  Mid: "Mid",
  Bot: "ADC",
  Support: "Sup",
};

export default function ChampionTable({ champions }: { champions: ChampionStatRow[] }) {
  const { t, locale } = useI18n();
  const [sort, setSort] = useState<SortKey>("games");
  const [minGames, setMinGames] = useState(20);
  const [role, setRole] = useState("all");

  const rows = useMemo(
    () =>
      champions
        .filter((c) => c.role === role && c.games >= minGames)
        .sort((a, b) => b[sort] - a[sort])
        .slice(0, 200),
    [champions, sort, minGames, role],
  );

  const header = (key: SortKey, label: string, tip: MsgKey, extra = "") => (
    <span className={`th-wrap th-num${extra}`}>
      <button
        type="button"
        className={`th-btn th-num${sort === key ? " active" : ""}`}
        onClick={() => setSort(key)}
      >
        {label}
        {sort === key ? " ▼" : ""}
      </button>
      <InfoTip k={tip} align="end" />
    </span>
  );

  return (
    <>
      <div className="controls">
        <span className="ctrl-label">{t("common.role")}</span>
        <div className="chips">
          {["all", ...ROLES].map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${r === role ? " active" : ""}`}
              onClick={() => setRole(r)}
            >
              {ROLE_SHORT[r]}
            </button>
          ))}
        </div>
        <span className="ctrl-label">{t("champions.minGames")}</span>
        <div className="chips">
          {MIN_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${m === minGames ? " active" : ""}`}
              onClick={() => setMinGames(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{t("champions.empty", { n: minGames })}</p>
      ) : (
        <div className="tbl tbl-champs">
          <div className="tbl-head">
            <span className="th-lab">{t("champions.champion")}</span>
            {header("games", t("common.games"), "tip.champGames")}
            {header("win_rate", t("common.winRate"), "tip.winRate")}
            {header("kda", t("common.kda"), "tip.kda", " col-kda")}
            <span className="th-wrap th-num col-players">
              <span className="th-lab th-num">{t("champions.players")}</span>
              <InfoTip k="tip.champPlayers" align="end" />
            </span>
          </div>
          {rows.map((c, i) => (
            <div className={`tbl-row${i === 0 ? " first" : ""}`} key={c.champion}>
              <span className="pcell">
                <span
                  className="champ-icon"
                  style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                  aria-hidden="true"
                />
                <span className="pname">{c.champion}</span>
              </span>
              <span className="cell-games cell-num">{c.games}</span>
              <span className="cell-score cell-num">
                {formatValue("percent", c.win_rate, locale)}
              </span>
              <span className="cell-num col-kda">
                {formatValue("ratio", c.kda, locale)}
              </span>
              <span className="cell-games cell-num col-players">{c.n_players}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
