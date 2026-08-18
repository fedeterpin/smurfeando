"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import RoleIcon from "@/components/RoleIcon";
import TeamLink from "@/components/TeamLink";
import type {
  LiveLineupRow,
  LiveMatch,
  LiveMeta,
  LiveTeamCard,
  LiveTournament,
  MatchdayLine,
} from "@/lib/live";
import {
  METRICS,
  dayKey,
  metricLabelKey,
  metricValue,
  parseUtc,
  winLoss,
} from "@/lib/livefmt";
import { ROLES } from "@/lib/stats";

export interface MatchdayProps {
  meta: LiveMeta | null;
  matches: LiveMatch[];
  tournaments: LiveTournament[];
  lineups: LiveLineupRow[];
  splits: MatchdayLine[];
  patches: (MatchdayLine & { patch: string })[];
}

// Columns shown inside a match card. The wide table (GPM, VS/min, champion pool,
// sorting) lives on the split page — here five numbers per player is the most a
// caster can read while the game is about to start.
const CARD_METRICS = METRICS.filter((m) => m !== "gpm" && m !== "vspm");
const ROLE_ORDER = new Map(ROLES.map((r, i) => [r as string, i]));

function TeamBadge({ team, right }: { team: LiveTeamCard; right?: boolean }) {
  const name = team.name ?? "TBD";
  return (
    <span className={`mday-side${right ? " right" : ""}`}>
      <span
        className="mday-logo"
        style={team.logo ? { backgroundImage: `url(${team.logo})` } : undefined}
        aria-hidden="true"
      >
        {!team.logo && name[0]}
      </span>
      <TeamLink nested slug={team.slug} className="mday-team">
        <span className="mday-team-long">{name}</span>
        <span className="mday-team-short">{team.short ?? name}</span>
      </TeamLink>
    </span>
  );
}

function PlayerLine({
  lineup,
  line,
}: {
  lineup: LiveLineupRow;
  line: MatchdayLine | null | undefined;
}) {
  const { t, locale } = useI18n();
  const name = (
    <>
      <span
        className="mday-face"
        style={
          lineup.image ? { backgroundImage: `url(${lineup.image})` } : undefined
        }
        aria-hidden="true"
      >
        {!lineup.image && lineup.player_id[0]}
      </span>
      <span className="mday-pname">{lineup.player_id}</span>
    </>
  );
  return (
    <li className="mday-player">
      <RoleIcon role={lineup.role} className="ic role sm" />
      {lineup.slug ? (
        <Link href={`/players/${lineup.slug}`} className="mday-plink">
          {name}
        </Link>
      ) : (
        <span className="mday-plink is-plain">{name}</span>
      )}
      {line && line.games > 0 ? (
        <span className="mday-nums">
          <span className="mday-num">
            <b>{`${line.games} (${winLoss(line)})`}</b>
            <i>{t("common.games")}</i>
          </span>
          {CARD_METRICS.map((m) => (
            <span className="mday-num" key={m}>
              <b>{metricValue(line, m, locale)}</b>
              <i>{t(metricLabelKey(m))}</i>
            </span>
          ))}
        </span>
      ) : (
        <span className="mday-nums empty">{t("live.noGames")}</span>
      )}
    </li>
  );
}

export default function MatchdayBoard({
  meta,
  matches,
  tournaments,
  lineups,
  splits,
  patches,
}: MatchdayProps) {
  const { t, locale } = useI18n();
  // The page is prerendered on the build machine, so the first render must not
  // depend on the reader's clock or zone: it goes out in UTC anchored on the ETL
  // timestamp, and swaps to local time right after hydration.
  const [zone, setZone] = useState<string | undefined>("UTC");
  const [now, setNow] = useState(() =>
    meta ? parseUtc(meta.generated_at) : new Date(0),
  );
  useEffect(() => {
    setZone(undefined);
    setNow(new Date());
  }, []);

  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [onPatch, setOnPatch] = useState(false);

  const byPage = useMemo(
    () => new Map(tournaments.map((x) => [x.overview_page, x])),
    [tournaments],
  );
  const splitBy = useMemo(
    () => new Map(splits.map((r) => [`${r.tournament} ${r.player}`, r])),
    [splits],
  );
  const patchBy = useMemo(
    () =>
      new Map(patches.map((r) => [`${r.tournament} ${r.patch} ${r.player}`, r])),
    [patches],
  );
  const lineupBy = useMemo(() => {
    const map = new Map<string, LiveLineupRow[]>();
    for (const row of lineups) {
      const key = `${row.tournament} ${row.team}`;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    for (const list of map.values())
      list.sort(
        (a, b) => (ROLE_ORDER.get(a.role) ?? 9) - (ROLE_ORDER.get(b.role) ?? 9),
      );
    return map;
  }, [lineups]);

  // A tournament that has not started (an announced bracket) carries no stats, so
  // the card falls back to the same league's split with the most games. The chip
  // then names that split: the numbers must never look like they are the bracket's.
  const statsPage = useMemo(() => {
    const withRows = new Set(splits.map((r) => r.tournament));
    const byLeague = new Map<string, LiveTournament[]>();
    for (const tour of tournaments) {
      const list = byLeague.get(tour.league);
      if (list) list.push(tour);
      else byLeague.set(tour.league, [tour]);
    }
    const map = new Map<string, LiveTournament>();
    for (const tour of tournaments) {
      if (withRows.has(tour.overview_page)) {
        map.set(tour.overview_page, tour);
        continue;
      }
      const sibling = (byLeague.get(tour.league) ?? [])
        .filter((t) => withRows.has(t.overview_page))
        .sort((a, b) => b.games - a.games)[0];
      if (sibling) map.set(tour.overview_page, sibling);
    }
    return map;
  }, [splits, tournaments]);

  const days = useMemo(() => {
    const map = new Map<string, LiveMatch[]>();
    for (const m of matches) {
      const key = dayKey(parseUtc(m.datetime_utc), zone);
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches, zone]);

  const todayKey = dayKey(now, zone);
  // Default to today; on a dark day (no pro match) jump to the next one with games.
  const fallback =
    days.find(([key]) => key >= todayKey)?.[0] ?? days.at(-1)?.[0] ?? todayKey;
  const active = picked && days.some(([k]) => k === picked) ? picked : fallback;
  const shown = days.find(([key]) => key === active)?.[1] ?? [];

  if (!matches.length) return null;

  const dayLabel = (key: string) => {
    const diff = Math.round(
      (Date.parse(`${key}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) /
        86_400_000,
    );
    if (diff === 0) return t("live.today");
    if (diff === -1) return t("live.yesterday");
    if (diff === 1) return t("live.tomorrow");
    return parseUtc(`${key} 12:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  };

  return (
    <section className="block matchday">
      <div className="mday-head">
        <h2 className="block-title">{t("live.title")}</h2>
        {meta && (
          <p className="mday-updated">
            {t("live.updated", {
              when: parseUtc(meta.generated_at).toLocaleString(locale, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: zone,
              }),
            })}
          </p>
        )}
      </div>

      <div className="mday-days" role="tablist" aria-label={t("live.title")}>
        {days.map(([key, list]) => (
          <button
            key={key}
            role="tab"
            aria-selected={key === active}
            className={`chip${key === active ? " active" : ""}`}
            onClick={() => {
              setPicked(key);
              setOpen(null);
            }}
          >
            {dayLabel(key)}
            <em>{list.length}</em>
          </button>
        ))}
      </div>

      <ul className="mday-list">
        {shown.map((match) => {
          const id = match.match_id ?? `${match.tournament}-${match.datetime_utc}`;
          const tour = byPage.get(match.tournament);
          const stats = statsPage.get(match.tournament);
          const borrowed = stats != null && stats.overview_page !== match.tournament;
          const done = match.winner != null;
          const isOpen = open === id;
          const time = parseUtc(match.datetime_utc).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: zone,
          });
          const sides: [LiveTeamCard, 1 | 2][] = [
            [match.team1, 1],
            [match.team2, 2],
          ];
          return (
            <li key={id} className={`mday-match${isOpen ? " is-open" : ""}`}>
              <button
                className="mday-row"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : id);
                  setOnPatch(false);
                }}
              >
                <span className="mday-time">{time}</span>
                <span className="mday-league" title={tour?.name ?? undefined}>
                  {tour?.league_logo ? (
                    <span
                      className="league-mark"
                      style={{ backgroundImage: `url(${tour.league_logo})` }}
                      aria-label={tour.league_short}
                      role="img"
                    />
                  ) : (
                    (tour?.league_short ?? "")
                  )}
                </span>
                <TeamBadge team={match.team1} />
                <span className={`mday-score${done ? " done" : ""}`}>
                  {done ? (
                    <>
                      <b className={match.winner === 1 ? "w" : ""}>
                        {match.team1_score ?? 0}
                      </b>
                      <i>–</i>
                      <b className={match.winner === 2 ? "w" : ""}>
                        {match.team2_score ?? 0}
                      </b>
                    </>
                  ) : (
                    <i>{match.best_of ? `Bo${match.best_of}` : "vs"}</i>
                  )}
                </span>
                <TeamBadge team={match.team2} right />
                <span className="mday-caret" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="mday-detail">
                  <div className="mday-scope">
                    <button
                      className={`chip${onPatch ? "" : " active"}`}
                      onClick={() => setOnPatch(false)}
                    >
                      {stats?.name ?? tour?.name ?? t("live.scopeSplit")}
                    </button>
                    {match.patch && (
                      <button
                        className={`chip${onPatch ? " active" : ""}`}
                        onClick={() => setOnPatch(true)}
                      >
                        {t("live.scopePatch", { patch: match.patch })}
                      </button>
                    )}
                    {(stats ?? tour) && (
                      <Link
                        className="mday-more"
                        href={`/splits/${(stats ?? tour)!.slug}`}
                      >
                        {t("live.fullSplit")}
                      </Link>
                    )}
                  </div>
                  <div className="mday-teams">
                    {sides.map(([team, side]) => {
                      const statsKey = stats?.overview_page ?? match.tournament;
                      const roster =
                        lineupBy.get(`${match.tournament} ${team.name}`) ?? [];
                      return (
                        <div className="mday-team-block" key={side}>
                          <h3>
                            <TeamLink slug={team.slug}>
                              {team.name ?? "TBD"}
                            </TeamLink>
                          </h3>
                          {roster.length ? (
                            <ul className="mday-players">
                              {roster.map((row) => (
                                <PlayerLine
                                  key={`${row.player}-${row.role}`}
                                  lineup={row}
                                  line={
                                    onPatch && match.patch
                                      ? patchBy.get(
                                          `${statsKey} ${match.patch} ${row.player}`,
                                        )
                                      : splitBy.get(`${statsKey} ${row.player}`)
                                  }
                                />
                              ))}
                            </ul>
                          ) : (
                            <p className="mday-empty">{t("live.noLineup")}</p>
                          )}
                          {roster.some((r) => r.source === "played") && (
                            <p className="mday-note">{t("live.lineupPlayed")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {stats && (
                    <p className="mday-note">
                      {t(borrowed ? "live.statScopeOther" : "live.statScope", {
                        scope:
                          onPatch && match.patch
                            ? `${stats.name} · ${t("live.scopePatch", { patch: match.patch })}`
                            : stats.name,
                      })}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mday-foot">
        <Link href="/splits">{t("live.allSplits")}</Link>
      </p>
    </section>
  );
}
