// Read-only access to the SQLite built by the ETL. Opens a fresh connection per
// call so the dev server reflects new data as the ETL/view refreshes.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH =
  process.env.SITE_DB_PATH ??
  path.join(process.cwd(), "..", "data", "web.sqlite");

function withDb<T>(fn: (db: Database.Database) => T, fallback: T): T {
  if (!fs.existsSync(DB_PATH)) return fallback;
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

// --- Leaderboards ---------------------------------------------------------
export interface LeaderboardRow {
  rank: number;
  player_id: string;
  display_id: string;
  slug: string | null;
  value: number;
  games: number | null;
  role: string | null;
  team: string | null;
  team_slug: string | null;
  image_url: string | null;
}

export function getLeaderboard(stat: string, scope = "all", limit = 100): LeaderboardRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT l.rank, l.player_id, l.display_id, pi.slug, l.value, l.games,
                  pi.role, pi.team, ta.slug AS team_slug, pi.image_url
           FROM leaderboards l
           LEFT JOIN player_index pi ON pi.player_id = l.player_id
           LEFT JOIN team_aliases ta ON ta.alias = pi.team
           WHERE l.stat = ? AND l.scope = ?
           ORDER BY l.rank LIMIT ?`,
        )
        .all(stat, scope, limit) as LeaderboardRow[],
    [],
  );
}

// --- Records --------------------------------------------------------------
export interface RecordRow {
  record_key: string;
  label: string;
  ref_id: string;
  display_id: string;
  slug: string | null;
  value: number;
  context: string;
}

export function getRecords(): RecordRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT r.record_key, r.label, r.ref_id, r.display_id, pi.slug, r.value, r.context
           FROM records r LEFT JOIN player_index pi ON pi.player_id = r.ref_id`,
        )
        .all() as RecordRow[],
    [],
  );
}

// --- Players --------------------------------------------------------------
export interface PlayerRow {
  player_id: string;
  // 'leaguepedia' = full profile; 'oe' = regional-only (no bio, photo or score).
  source: "leaguepedia" | "oe";
  display_id: string;
  slug: string;
  name: string | null;
  role: string | null;
  country: string | null;
  team: string | null;
  team_slug: string | null;
  is_retired: number | null;
  games: number;
  wins: number;
  kda: number;
  win_rate: number;
  intl_titles: number;
  worlds_titles: number;
  msi_titles: number;
  worlds_appearances: number;
  intl_games: number | null;
  kda_intl: number | null;
  score: number;
  score_breakdown: string | null;
  image_filename: string | null;
  image_url: string | null;
  team_logo_url: string | null;
}

export function listPlayerSlugs(): { slug: string }[] {
  return withDb(
    (db) => db.prepare(`SELECT slug FROM player_index`).all() as { slug: string }[],
    [],
  );
}

// Just the columns the index table renders. `SELECT *` ships score_breakdown — a
// JSON blob per player — and a dozen unused fields to the browser; across 3,792
// players that is most of the page weight.
export type PlayerIndexRow = Pick<
  PlayerRow,
  | "player_id"
  | "display_id"
  | "slug"
  | "name"
  | "role"
  | "team"
  | "team_slug"
  | "games"
  | "kda"
  | "win_rate"
  | "intl_titles"
  | "image_url"
  | "score"
>;

export function listPlayerIndex(): PlayerIndexRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT pi.player_id, pi.display_id, pi.slug, pi.name, pi.role, pi.team,
                  ta.slug AS team_slug, pi.games, pi.kda, pi.win_rate,
                  pi.intl_titles, pi.image_url, pi.score
           FROM player_index pi
           LEFT JOIN team_aliases ta ON ta.alias = pi.team
           ORDER BY pi.score DESC, pi.games DESC`,
        )
        .all() as PlayerIndexRow[],
    [],
  );
}

export function getPlayerBySlug(slug: string): PlayerRow | null {
  return withDb(
    (db) =>
      (db
        .prepare(
          `SELECT pi.*, ta.slug AS team_slug FROM player_index pi
           LEFT JOIN team_aliases ta ON ta.alias = pi.team
           WHERE pi.slug = ?`,
        )
        .get(slug) as PlayerRow) ?? null,
    null,
  );
}

// Rank by smurf score (1 = highest), and the total number of ranked players.
// Counts Leaguepedia-sourced players only: the score measures international
// competition, and regional-only players have no international games, so they all
// sit at 0. Including them would silently restate every rank as "of 3,792".
export function getScoreRank(score: number): { rank: number; total: number } {
  return withDb(
    (db) => {
      const higher = db
        .prepare(
          `SELECT COUNT(*) AS c FROM player_index
           WHERE score > ? AND source = 'leaguepedia'`,
        )
        .get(score) as { c: number };
      const total = db
        .prepare(`SELECT COUNT(*) AS c FROM player_index WHERE source = 'leaguepedia'`)
        .get() as { c: number };
      return { rank: higher.c + 1, total: total.c };
    },
    { rank: 0, total: 0 },
  );
}

// --- Regional career (Oracle's Elixir scopes) -----------------------------
export interface RegionRow {
  region: string; // scope suffix, e.g. 'korea'
  region_label: string;
}

// Regions that actually have a leaderboard, biggest first. Driven by the data so a
// change to the ETL allowlist shows up without touching the web.
export function getRegions(): RegionRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT l.region, l.region_label, SUM(p.games) AS games
           FROM oe_leagues l
           JOIN player_career_stats p ON p.scope = 'region:' || l.region
           WHERE l.scope = 'regional'
           GROUP BY l.region ORDER BY games DESC`,
        )
        .all() as RegionRow[],
    [],
  );
}

export interface CareerScopeRow {
  scope: string;
  games: number;
  wins: number;
  kda: number;
  win_rate: number;
  economy_games: number | null;
  gd15: number | null;
  gold15: number | null;
  cs_per_min: number | null;
  dpm: number | null;
  pentakills: number | null;
  region_label: string | null;
}

// A player's regional careers, biggest first. `region_label` is null for the
// combined 'regional' row.
export function getPlayerRegions(playerId: string): CareerScopeRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT p.scope, p.games, p.wins, p.kda, p.win_rate, p.economy_games,
                  p.gd15, p.gold15, p.cs_per_min, p.dpm, p.pentakills,
                  (SELECT l.region_label FROM oe_leagues l
                    WHERE 'region:' || l.region = p.scope LIMIT 1) AS region_label
           FROM player_career_stats p
           WHERE p.player_id = ? AND p.scope LIKE 'region:%'
           ORDER BY p.games DESC`,
        )
        .all(playerId) as CareerScopeRow[],
    [],
  );
}

export interface ChampionPoolRow {
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
}

export function getPlayerChampions(playerId: string, limit = 12): ChampionPoolRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT champion, games, wins, kills, deaths, assists, kda
           FROM player_champions WHERE player_id = ?
           ORDER BY games DESC, wins DESC LIMIT ?`,
        )
        .all(playerId, limit) as ChampionPoolRow[],
    [],
  );
}

export interface TitleRow {
  overview_page: string;
  event: string;
  league: string;
  year: string;
  team: string | null;
  team_slug: string | null;
  team_logo_url: string | null;
}

export function getPlayerTitles(playerId: string): TitleRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT pt.overview_page, pt.event, pt.league, pt.year, pt.team,
                  ta.slug AS team_slug, pt.team_logo_url
           FROM player_titles pt
           LEFT JOIN team_aliases ta ON ta.alias = pt.team
           WHERE pt.player_id = ? ORDER BY pt.year DESC, pt.league`,
        )
        .all(playerId) as TitleRow[],
    [],
  );
}

export interface TeamHistoryRow {
  team: string;
  team_slug: string | null;
  team_logo_url: string | null;
  first_year: string;
  last_year: string;
  games: number;
}

export function getPlayerTeams(playerId: string): TeamHistoryRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT pt.team, ta.slug AS team_slug, pt.team_logo_url,
                  pt.first_year, pt.last_year, pt.games
           FROM player_teams pt
           LEFT JOIN team_aliases ta ON ta.alias = pt.team
           WHERE pt.player_id = ?
           ORDER BY pt.first_year, pt.last_year`,
        )
        .all(playerId) as TeamHistoryRow[],
    [],
  );
}

export interface RankingRow {
  stat: string;
  scope: string;
  // Display name for a region scope ('region:brazil' -> 'Brazil'); null for the
  // scopes the UI can already name (all, role:*, regional). Resolved here because
  // the label belongs to the data, not to a string transform in the UI.
  scope_label: string | null;
  rank: number;
  value: number;
  games: number | null;
}

// Boards where this player finishes near the top ("records held" / notable ranks).
export function getPlayerRankings(playerId: string, maxRank = 20): RankingRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT l.stat, l.scope, l.rank, l.value, l.games,
                  (SELECT o.region_label FROM oe_leagues o
                    WHERE 'region:' || o.region = l.scope LIMIT 1) AS scope_label
           FROM leaderboards l
           WHERE l.player_id = ? AND l.rank <= ? ORDER BY l.rank, l.stat`,
        )
        .all(playerId, maxRank) as RankingRow[],
    [],
  );
}

// --- Champions ------------------------------------------------------------
export interface ChampionStatRow {
  champion: string;
  role: string; // 'all' | Top | Jungle | Mid | Bot | Support
  games: number;
  wins: number;
  win_rate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  n_players: number;
}

export function getChampionStats(minGames = 1, limit = 2000): ChampionStatRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT * FROM champion_stats WHERE games >= ? ORDER BY games DESC LIMIT ?`,
        )
        .all(minGames, limit) as ChampionStatRow[],
    [],
  );
}

// --- Teams ----------------------------------------------------------------
export interface TeamIndexRow {
  team_id: string;
  name: string;
  slug: string;
  region: string | null;
  short: string | null;
  is_disbanded: number | null;
  logo_url: string | null;
  games: number;
  players: number;
  first_year: string | null;
  last_year: string | null;
  titles: number;
  podiums: number;
}

export function listTeams(): TeamIndexRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT * FROM team_index ORDER BY titles DESC, podiums DESC, games DESC`,
        )
        .all() as TeamIndexRow[],
    [],
  );
}

export function getTeamBySlug(slug: string): TeamIndexRow | null {
  return withDb(
    (db) =>
      (db.prepare(`SELECT * FROM team_index WHERE slug = ?`).get(slug) as TeamIndexRow) ??
      null,
    null,
  );
}

export interface TeamRosterRow {
  player_id: string;
  display_id: string | null;
  slug: string | null;
  image_url: string | null;
  role: string | null;
  first_year: string;
  last_year: string;
  games: number;
  is_current: number;
}

export function getTeamRoster(teamId: string): TeamRosterRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT tr.player_id, pi.display_id, pi.slug, pi.image_url,
                  COALESCE(tr.role, pi.role) AS role,
                  tr.first_year, tr.last_year, tr.games, tr.is_current
           FROM team_rosters tr
           LEFT JOIN player_index pi ON pi.player_id = tr.player_id
           WHERE tr.team_id = ?
           ORDER BY tr.is_current DESC, tr.games DESC`,
        )
        .all(teamId) as TeamRosterRow[],
    [],
  );
}

export interface TeamPodiumRow {
  overview_page: string;
  event: string;
  league: string;
  year: string | null;
  place: string; // '1' | '2' | '3' | '3-4'
  place_num: number;
}

export function getTeamPodiums(teamId: string): TeamPodiumRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT overview_page, event, league, year, place, place_num
           FROM team_podiums WHERE team_id = ?
           ORDER BY year DESC, place_num`,
        )
        .all(teamId) as TeamPodiumRow[],
    [],
  );
}

export function getMeta(key: string): string | null {
  return withDb((db) => {
    const row = db.prepare(`SELECT value FROM etl_meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }, null);
}
