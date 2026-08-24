"use client";

import { useState } from "react";
import LeagueMark from "@/components/LeagueMark";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import InfoTip from "@/components/InfoTip";
import { championSquare } from "@/lib/champion";
import { formatValue } from "@/lib/stats";
import type { LivePatchRow, LiveSplitRow, LiveTournament } from "@/lib/live";
import {
  METRICS,
  metricHelpKey,
  metricLabelKey,
  metricValue,
} from "@/lib/livefmt";

export interface PlayerSplitEntry {
  tournament: LiveTournament | null;
  line: LiveSplitRow;
  patches: LivePatchRow[];
}

/**
 * How a player is doing in the split being played right now — the gol.gg line
 * (games, record, KDA, KP%, CS/min, DPM, GPM, VS/min), the champions they have
 * picked in it, and the same numbers per patch behind a toggle.
 *
 * Separate from everything else on the profile, which is all-time: this block is
 * the only part of the page that moves twice a day.
 */
export default function PlayerSplit({ entry }: { entry: PlayerSplitEntry }) {
  const { t, locale } = useI18n();
  const [byPatch, setByPatch] = useState(false);
  const { tournament, line, patches } = entry;
  const pool = line.champions.slice(0, 6);

  return (
    <div className="psplit">
      <div className="psplit-head">
        {tournament?.league_logo && (
          <LeagueMark logo={tournament.league_logo} label={tournament.league} />
        )}
        <Link className="psplit-name" href={`/splits/${tournament?.slug ?? ""}`}>
          {tournament?.name ?? line.tournament}
        </Link>
        {line.team && <span className="psplit-team">{line.team}</span>}
        {patches.length > 1 && (
          <button
            type="button"
            className={`chip${byPatch ? " active" : ""}`}
            onClick={() => setByPatch(!byPatch)}
          >
            {t("player.byPatch")}
          </button>
        )}
      </div>

      <div className="psplit-line">
        <span className="psplit-stat">
          <b>{line.games}</b>
          <i>{t("common.games")}</i>
        </span>
        <span className="psplit-stat">
          <b>
            {line.wins}
            {t("common.winShort")}–{line.losses}
            {t("common.lossShort")}
          </b>
          <i>{t("live.record")}</i>
        </span>
        <span className="psplit-stat">
          <b>
            {line.win_rate == null
              ? "—"
              : formatValue("percent", line.win_rate, locale)}
          </b>
          <i>{t("common.winRate")}</i>
        </span>
        {METRICS.map((metric) => (
          <span className="psplit-stat" key={metric}>
            <b>{metricValue(line, metric, locale)}</b>
            <i>
              {t(metricLabelKey(metric))}
              <InfoTip k={metricHelpKey(metric)} />
            </i>
          </span>
        ))}
      </div>

      {byPatch ? (
        <div className="tbl tbl-ppatch">
          <div className="tbl-head">
            <span className="th-lab">{t("live.patch")}</span>
            <span className="th-lab th-num">{t("common.games")}</span>
            <span className="th-lab th-num">{t("live.record")}</span>
            {METRICS.map((metric) => (
              <span className="th-lab th-num" key={metric}>
                {t(metricLabelKey(metric))}
              </span>
            ))}
          </div>
          {patches.map((row, i) => (
            <div className={`tbl-row${i === 0 ? " first" : ""}`} key={row.patch}>
              <span className="pname">{row.patch}</span>
              <span className="cell-num">{row.games}</span>
              <span className="cell-num">
                {row.wins}
                {t("common.winShort")}–{row.losses}
                {t("common.lossShort")}
              </span>
              {METRICS.map((metric) => (
                <span className="cell-num" key={metric}>
                  {metricValue(row, metric, locale)}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        pool.length > 0 && (
          <div className="psplit-pool">
            {pool.map((champion) => (
              <span className="psplit-champ" key={champion.champion}>
                <span
                  className="champ-icon sm"
                  style={{
                    backgroundImage: `url(${championSquare(champion.champion)})`,
                  }}
                  aria-hidden="true"
                />
                <span className="psplit-champ-name">{champion.champion}</span>
                <span className="psplit-champ-num">
                  {champion.games}
                  {t("common.gamesShort")} · {champion.wins}
                  {t("common.winShort")}
                </span>
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}
