// Build-time reader for the daily "live" slice (data/live/*.json), produced by
// `python -m etl.live` on a cron. Deliberately NOT part of web.sqlite: the almanac
// is refreshed by hand and rarely, this one twice a day, and sharing a file would
// mean rewriting a 16 MB blob into git history on every run.
//
// Everything degrades to empty: a checkout without data/live still builds, the home
// just renders without the matches section.
import fs from "node:fs";
import path from "node:path";

const LIVE_DIR =
  process.env.LIVE_DIR ?? path.join(process.cwd(), "..", "data", "live");

function read<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(LIVE_DIR, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export interface LiveMeta {
  generated_at: string;
  window_from: string;
  window_to: string;
  tournaments: number;
  matches: number;
  games: number;
  players: number;
}

export interface LiveTournament {
  overview_page: string;
  slug: string;
  name: string;
  league: string;
  league_short: string;
  region: string | null;
  region_label: string | null;
  split: string | null;
  year: string | null;
  is_playoffs: boolean;
  patches: string[];
  games: number;
}

export interface LiveTeamCard {
  name: string | null;
  slug: string | null;
  logo: string | null;
  short: string | null;
}

export interface LiveMatch {
  match_id: string | null;
  tournament: string;
  datetime_utc: string;
  best_of: number | null;
  tab: string | null;
  round: string | null;
  phase: string | null;
  group: string | null;
  is_tiebreaker: boolean;
  patch: string | null;
  team1: LiveTeamCard;
  team2: LiveTeamCard;
  team1_score: number | null;
  team2_score: number | null;
  winner: number | null;
}

/** Per-player totals for a split. `kp` and `win_rate` are ratios, not percents. */
export interface LiveStanding {
  tournament: string;
  /** 1-based: the wiki emits several tables per page with no group column. */
  group: number;
  place: number | null;
  place_label: string | null;
  team: LiveTeamCard;
  win_series: number;
  loss_series: number;
  tie_series: number;
  win_games: number;
  loss_games: number;
  points: number;
  streak: number;
  streak_direction: string | null;
}

export interface LiveStatLine {
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  win_rate: number | null;
  minutes: number | null;
  cspm: number | null;
  gpm: number | null;
  dpm: number | null;
  vspm: number | null;
  kp: number | null;
}

export interface LiveSplitRow extends LiveStatLine {
  tournament: string;
  player: string;
  player_id: string;
  slug: string | null;
  image: string | null;
  role: string | null;
  team: string | null;
  team_slug: string | null;
  team_logo: string | null;
  team_short: string | null;
  champions: { champion: string; games: number; wins: number }[];
}

export interface LivePatchRow extends LiveStatLine {
  tournament: string;
  player: string;
  patch: string;
}

export interface LiveLineupRow {
  tournament: string;
  team: string;
  role: string;
  player: string;
  player_id: string;
  slug: string | null;
  image: string | null;
  /** "roster" = declared on the wiki, "played" = inferred from who played most. */
  source: "roster" | "played";
}

export const getLiveMeta = (): LiveMeta | null =>
  read<LiveMeta | null>("meta.json", null);
export const getLiveTournaments = (): LiveTournament[] =>
  read<LiveTournament[]>("tournaments.json", []);
export const getLiveMatches = (): LiveMatch[] =>
  read<LiveMatch[]>("matches.json", []);
export const getLiveLineups = (): LiveLineupRow[] =>
  read<LiveLineupRow[]>("lineups.json", []);
export const getLiveSplits = (): LiveSplitRow[] =>
  read<LiveSplitRow[]>("player_splits.json", []);
export const getLivePatches = (): LivePatchRow[] =>
  read<LivePatchRow[]>("player_patches.json", []);
export const getLiveStandings = (): LiveStanding[] =>
  read<LiveStanding[]>("standings.json", []);

/** Numbers only: on the home, identity comes from the lineup row. */
export type MatchdayLine = Pick<
  LiveStatLine,
  "games" | "wins" | "losses" | "win_rate" | "kda" | "kp" | "cspm" | "dpm"
> & { tournament: string; player: string };

const trim = (row: LiveStatLine & { tournament: string; player: string }): MatchdayLine => ({
  tournament: row.tournament,
  player: row.player,
  games: row.games,
  wins: row.wins,
  losses: row.losses,
  win_rate: row.win_rate,
  kda: row.kda,
  kp: row.kp,
  cspm: row.cspm,
  dpm: row.dpm,
});

/** Days around the build shown on the home. The rest of the window lives in /splits. */
const HOME_DAYS_BACK = 1;
const HOME_DAYS_FWD = 4;

/**
 * Everything the home needs, trimmed hard: only the days around the build, only
 * the tournaments being played, only the lineups of the teams involved and only
 * their numbers. This payload is inlined into the static HTML, so every field kept
 * here is bytes every reader downloads — hence no champion pools, no photos twice
 * and no columns the match card does not print.
 */
export function getMatchday() {
  const meta = getLiveMeta();
  const anchor = meta ? Date.parse(`${meta.generated_at.replace(" ", "T")}Z`) : Date.now();
  const from = anchor - HOME_DAYS_BACK * 86_400_000;
  const to = anchor + HOME_DAYS_FWD * 86_400_000;
  const matches = getLiveMatches().filter((m) => {
    const at = Date.parse(`${m.datetime_utc.replace(" ", "T")}Z`);
    return at >= from && at <= to;
  });
  const teams = new Set<string>();
  for (const m of matches) {
    if (m.team1.name) teams.add(`${m.tournament} ${m.team1.name}`);
    if (m.team2.name) teams.add(`${m.tournament} ${m.team2.name}`);
  }
  const lineups = getLiveLineups().filter((l) =>
    teams.has(`${l.tournament} ${l.team}`),
  );
  // Every active split of the players involved, not just the one being played:
  // an announced bracket (playoffs, play-in) has no games yet, and a card full of
  // "no games" is useless to someone about to cast it. The board falls back to the
  // same league's previous phase, which needs those rows in the payload.
  const squad = new Set(lineups.map((l) => l.player));
  const splits = getLiveSplits()
    .filter((r) => squad.has(r.player))
    .map(trim);
  // Only the patch each match is played on: the full patch history belongs to the
  // split page, where it is a filter rather than a second set of columns.
  const played = new Set(
    matches.filter((m) => m.patch).map((m) => `${m.tournament} ${m.patch}`),
  );
  const patches = getLivePatches()
    .filter((r) => played.has(`${r.tournament} ${r.patch}`) && squad.has(r.player))
    .map((r) => ({ ...trim(r), patch: r.patch }));
  return {
    meta,
    matches,
    // All of them (14 rows): the board needs the league and name of the split it
    // falls back to, which is not necessarily one with a match in the window.
    tournaments: getLiveTournaments(),
    lineups,
    splits,
    patches,
  };
}

/**
 * The lineup a team has declared for the split it is playing right now, with each
 * player's line in that split. This beats the almanac's roster flag for "who plays
 * here today": it comes from the wiki's tournament roster and refreshes twice a
 * day, while the almanac only knows a player's last team and is rebuilt by hand.
 */
export function getTeamLineup(names: string[]) {
  const wanted = new Set(names.filter(Boolean).map((n) => n.toLowerCase()));
  if (!wanted.size) return null;
  const rows = getLiveLineups().filter((l) => wanted.has(l.team.toLowerCase()));
  if (!rows.length) return null;

  // An org can appear in several active tournaments at once (league + playoffs +
  // an international): the split with the most games is the one underway.
  const tournaments = new Map(
    getLiveTournaments().map((t) => [t.overview_page, t] as const),
  );
  const byPage = new Map<string, LiveLineupRow[]>();
  for (const row of rows) {
    const list = byPage.get(row.tournament);
    if (list) list.push(row);
    else byPage.set(row.tournament, [row]);
  }
  const [page, players] = [...byPage.entries()].sort(
    (a, b) =>
      (tournaments.get(b[0])?.games ?? 0) - (tournaments.get(a[0])?.games ?? 0),
  )[0];

  const stats = new Map(
    getLiveSplits()
      .filter((r) => r.tournament === page)
      .map((r) => [r.player, r] as const),
  );
  return {
    tournament: tournaments.get(page) ?? null,
    players: players.map((p) => ({
      player_id: p.player,
      name: p.player_id,
      slug: p.slug,
      image: p.image,
      role: p.role,
      games: stats.get(p.player)?.games ?? null,
    })),
  };
}

/**
 * Team logos per split, for the index cards. Standings first (they carry the real
 * field, in order), matches as the fallback for a bracket the wiki publishes no
 * table for — MSI and the Esports World Cup would otherwise show none.
 */
export function getSplitTeams(): Map<string, LiveTeamCard[]> {
  const byPage = new Map<string, LiveTeamCard[]>();
  const add = (page: string, team: LiveTeamCard) => {
    if (!team.name) return;
    const list = byPage.get(page) ?? [];
    if (!list.some((t) => t.name === team.name)) list.push(team);
    byPage.set(page, list);
  };
  const standings = getLiveStandings();
  const ranked = new Set(standings.map((r) => r.tournament));
  for (const row of standings) add(row.tournament, row.team);
  for (const match of getLiveMatches()) {
    // Re-reading the file per match would be 350 reads for nothing.
    if (ranked.has(match.tournament)) continue;
    add(match.tournament, match.team1);
    add(match.tournament, match.team2);
  }
  return byPage;
}

/** A single split's page: its player table, its patch breakdown and its matches. */
export function getSplit(slug: string) {
  const tournament = getLiveTournaments().find((t) => t.slug === slug) ?? null;
  if (!tournament) return null;
  const page = tournament.overview_page;
  return {
    tournament,
    standings: getLiveStandings().filter((r) => r.tournament === page),
    rows: getLiveSplits().filter((r) => r.tournament === page),
    patches: getLivePatches().filter((r) => r.tournament === page),
    matches: getLiveMatches().filter((m) => m.tournament === page),
  };
}
