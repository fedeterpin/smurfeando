"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import TeamLink from "@/components/TeamLink";
import type { LiveMatch } from "@/lib/live";
import { parseUtc } from "@/lib/livefmt";

const VISIBLE_ROUNDS = 3;

/**
 * The split round by round, newest first. In a group phase this reads as the
 * weekly schedule; in a playoff it reads as the bracket, which is the same data
 * seen from the other end (`ShownRound` is 'Semifinals', 'Finals'...).
 */
export default function SplitRounds({ matches }: { matches: LiveMatch[] }) {
  const { t, locale } = useI18n();
  const [all, setAll] = useState(false);

  const rounds = useMemo(() => {
    const map = new Map<string, LiveMatch[]>();
    for (const match of matches) {
      const key = match.round || match.tab || "—";
      const list = map.get(key);
      if (list) list.push(match);
      else map.set(key, [match]);
    }
    // Newest round first: a reader opening a split page wants the last results.
    return [...map.entries()]
      .map(([name, list]) => ({
        name,
        matches: [...list].sort((a, b) =>
          a.datetime_utc.localeCompare(b.datetime_utc),
        ),
        at: list.reduce((max, m) => (m.datetime_utc > max ? m.datetime_utc : max), ""),
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [matches]);

  if (!rounds.length) return null;
  const shown = all ? rounds : rounds.slice(0, VISIBLE_ROUNDS);

  return (
    <>
      {shown.map((round) => (
        <div className="round" key={round.name}>
          <h3 className="round-name">{round.name}</h3>
          <ul className="round-list">
            {round.matches.map((match) => {
              const done = match.winner != null;
              return (
                <li
                  className="round-match"
                  key={match.match_id ?? `${match.datetime_utc}-${match.team1.name}`}
                >
                  <span className="round-date">
                    {match.datetime_utc
                      ? parseUtc(match.datetime_utc).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })
                      : "—"}
                  </span>
                  <span className={`round-side${match.winner === 1 ? " won" : ""}`}>
                    <TeamLink nested slug={match.team1.slug}>
                      {match.team1.name ?? "TBD"}
                    </TeamLink>
                    <span
                      className="round-logo"
                      style={
                        match.team1.logo
                          ? { backgroundImage: `url(${match.team1.logo})` }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                  </span>
                  <span className={`round-score${done ? " done" : ""}`}>
                    {done ? (
                      <>
                        {match.team1_score ?? 0}
                        <i>–</i>
                        {match.team2_score ?? 0}
                      </>
                    ) : (
                      <i>{match.best_of ? `Bo${match.best_of}` : "vs"}</i>
                    )}
                  </span>
                  <span className={`round-side right${match.winner === 2 ? " won" : ""}`}>
                    <span
                      className="round-logo"
                      style={
                        match.team2.logo
                          ? { backgroundImage: `url(${match.team2.logo})` }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <TeamLink nested slug={match.team2.slug}>
                      {match.team2.name ?? "TBD"}
                    </TeamLink>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {rounds.length > VISIBLE_ROUNDS && (
        <div className="tbl-foot">
          <button type="button" onClick={() => setAll(!all)}>
            {all
              ? t("split.showFewerRounds")
              : t("split.showAllRounds", { n: rounds.length })}
          </button>
        </div>
      )}
    </>
  );
}
