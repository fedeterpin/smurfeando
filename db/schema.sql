-- smurfeando SQLite schema.
-- SILVER layer: columns = Cargo field names (verbatim) so the loader
--   can insert row-dicts without mapping. INTEGER/REAL types for numeric coercion.
-- GOLD layer: tables aggregated/precomputed by the ETL (snake_case).
-- Source: Leaguepedia (CC-BY-SA). See README.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;   -- bulk load; integrity is guaranteed in the transform

-- =====================================================================
-- SILVER
-- =====================================================================

-- One tournament per row. Tier is computed in the transform (tiers.py).
CREATE TABLE IF NOT EXISTS tournaments (
    OverviewPage     TEXT PRIMARY KEY,
    Name             TEXT,
    League           TEXT,
    Region           TEXT,
    Year             TEXT,
    TournamentLevel  TEXT,
    IsQualifier      INTEGER,
    IsPlayoffs       INTEGER,
    IsOfficial       INTEGER,
    Date             TEXT,
    DateStart        TEXT,
    Split            TEXT,
    Prizepool        TEXT,
    Tier             TEXT     -- derived: intl_premier|intl_legacy|regional_playoffs|regional_regular|exhibition
);
CREATE INDEX IF NOT EXISTS idx_tournaments_league ON tournaments(League);
CREATE INDEX IF NOT EXISTS idx_tournaments_tier   ON tournaments(Tier);
CREATE INDEX IF NOT EXISTS idx_tournaments_year   ON tournaments(Year);

-- One game per row.
CREATE TABLE IF NOT EXISTS scoreboard_games (
    GameId             TEXT PRIMARY KEY,
    MatchId            TEXT,
    OverviewPage       TEXT,
    Tournament         TEXT,
    Team1              TEXT,
    Team2              TEXT,
    WinTeam            TEXT,
    LossTeam           TEXT,
    Winner             INTEGER,
    Team1Score         INTEGER,
    Team2Score         INTEGER,
    DateTime_UTC       TEXT,
    Gamelength_Number  REAL,
    Patch              TEXT,
    RiotPlatformGameId TEXT,   -- join to Oracle's Elixir (OE.gameid)
    RiotGameId         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sg_overview ON scoreboard_games(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_sg_riotpgid ON scoreboard_games(RiotPlatformGameId);
CREATE INDEX IF NOT EXISTS idx_sg_date     ON scoreboard_games(DateTime_UTC);

-- One player per game (fact table / backbone).
CREATE TABLE IF NOT EXISTS scoreboard_players (
    UniqueLine        TEXT PRIMARY KEY,
    Link              TEXT,    -- canonical player identity (== Players.OverviewPage)
    Name              TEXT,    -- handle shown in that game (may be an old alias)
    Champion          TEXT,
    Kills             INTEGER,
    Deaths            INTEGER,
    Assists           INTEGER,
    Gold              INTEGER,
    CS                INTEGER,
    DamageToChampions INTEGER,
    VisionScore       INTEGER,
    Role              TEXT,
    Role_Number       INTEGER,
    Side              INTEGER,
    Team              TEXT,
    TeamKills         INTEGER,
    PlayerWin         TEXT,    -- 'Yes'/'No' (verify in Phase 0)
    DateTime_UTC      TEXT,
    Tournament        TEXT,
    OverviewPage      TEXT,
    GameId            TEXT,
    MatchId           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sp_link     ON scoreboard_players(Link);
CREATE INDEX IF NOT EXISTS idx_sp_overview ON scoreboard_players(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_sp_game     ON scoreboard_players(GameId);
CREATE INDEX IF NOT EXISTS idx_sp_champ    ON scoreboard_players(Champion);

-- Player bio/roster (canonical identity = OverviewPage).
CREATE TABLE IF NOT EXISTS players (
    OverviewPage      TEXT PRIMARY KEY,
    ID                TEXT,    -- current canonical display ID
    Name              TEXT,    -- real name
    NativeName        TEXT,
    Country           TEXT,
    Nationality       TEXT,
    NationalityPrimary TEXT,
    Residency         TEXT,
    Role              TEXT,
    Team              TEXT,
    Birthdate         TEXT,
    IsRetired         INTEGER,
    IsSubstitute      INTEGER,
    Image             TEXT     -- profile photo file name (Leaguepedia)
);
CREATE INDEX IF NOT EXISTS idx_players_id ON players(ID);

-- Alias -> canonical map (identity resolution).
CREATE TABLE IF NOT EXISTS player_redirects (
    AllName      TEXT PRIMARY KEY,   -- any alias/handle/variant
    OverviewPage TEXT,               -- canonical Players.OverviewPage
    ID           TEXT
);
CREATE INDEX IF NOT EXISTS idx_pr_overview ON player_redirects(OverviewPage);

-- Placements/winners per tournament. No single-field natural PK -> rowid + composite UNIQUE.
CREATE TABLE IF NOT EXISTS tournament_results (
    OverviewPage TEXT,
    Event        TEXT,
    Place        TEXT,
    Place_Number INTEGER,
    Team         TEXT,
    RosterPage   TEXT,
    PageAndTeam  TEXT,
    Prize        TEXT,
    Qualified    INTEGER,
    UNIQUE(OverviewPage, Place, Team)
);
CREATE INDEX IF NOT EXISTS idx_tr_overview ON tournament_results(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_tr_place    ON tournament_results(Place_Number);

-- Participating players per event (roster).
CREATE TABLE IF NOT EXISTS tournament_players (
    OverviewPage    TEXT,
    Team            TEXT,
    Link            TEXT,   -- == Players.OverviewPage
    Player          TEXT,
    Role            TEXT,
    PageAndTeam     TEXT,
    N_PlayerInTeam  INTEGER,
    TeamOrder       INTEGER,
    UNIQUE(OverviewPage, Team, Link)
);
CREATE INDEX IF NOT EXISTS idx_tp_overview ON tournament_players(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_tp_link     ON tournament_players(Link);
CREATE INDEX IF NOT EXISTS idx_tp_pat      ON tournament_players(PageAndTeam);

-- =====================================================================
-- GOLD (precomputed by transform/aggregate)
-- =====================================================================

-- Career stats per player (grain: player_id[, scope]).
CREATE TABLE IF NOT EXISTS player_career_stats (
    player_id   TEXT NOT NULL,   -- == Link / Players.OverviewPage
    scope       TEXT NOT NULL,   -- 'all' | 'intl_premier' | tier | role...
    display_id  TEXT,            -- canonical ID for display
    games       INTEGER,
    wins        INTEGER,
    losses      INTEGER,
    kills       INTEGER,
    deaths      INTEGER,
    assists     INTEGER,
    kda         REAL,            -- (kills+assists)/max(deaths,1)
    win_rate    REAL,
    -- Per-timing economy, Oracle's Elixir only, so NULL on Leaguepedia-sourced
    -- scopes. Averaged over datacompleteness='complete' games ONLY, which is what
    -- economy_games counts — it is smaller than `games` and can be 0 (the LPL has
    -- had no timings since 2022). Rank on these only above config.OE_MIN_COMPLETE_GAMES.
    economy_games INTEGER,
    gd15        REAL,            -- avg gold difference vs lane opponent at 15 min
    gold15      REAL,            -- avg gold at 15 min
    cs_per_min  REAL,
    dpm         REAL,            -- damage to champions per minute
    -- Oracle's Elixir only, and absent from 'partial' games just like the timings,
    -- so the LPL contributes none from 2022 on. Scoped totals here exclude games
    -- Leaguepedia also has; the career record does not (see compute_pentakills).
    pentakills  INTEGER,
    PRIMARY KEY (player_id, scope)
);

-- Ranked, precomputed leaderboards (one row per position of a board).
CREATE TABLE IF NOT EXISTS leaderboards (
    stat        TEXT NOT NULL,   -- 'career_kda' | 'games_played' | 'career_kills' | 'win_rate' | 'intl_titles' | 'worlds_titles'
    scope       TEXT NOT NULL,   -- 'all' | 'intl_premier' | role | ...
    rank        INTEGER NOT NULL,
    player_id   TEXT NOT NULL,
    display_id  TEXT,
    value       REAL,            -- metric value (for counts, integer stored as REAL)
    games       INTEGER,         -- sample (to show the threshold inline)
    PRIMARY KEY (stat, scope, rank)
);
CREATE INDEX IF NOT EXISTS idx_lb_player ON leaderboards(player_id);

-- Singleton records ("record book"): the top-1 of each record with its context.
CREATE TABLE IF NOT EXISTS records (
    record_key  TEXT PRIMARY KEY,   -- 'most_intl_titles' | 'best_worlds_kda' | ...
    label       TEXT,
    ref_id      TEXT,               -- player_id (or game/tournament id) that holds the record
    display_id  TEXT,
    value       REAL,
    context     TEXT                -- JSON with detail (tournament, date, games, threshold)
);

-- Player index (denormalized): slug resolution + header + list/search.
CREATE TABLE IF NOT EXISTS player_index (
    player_id     TEXT PRIMARY KEY,   -- Leaguepedia Link, or an OE playerid for regional-only players
    source        TEXT,               -- 'leaguepedia' (full profile) | 'oe' (regional only: no bio, photo or score)
    display_id    TEXT,
    slug          TEXT,               -- for the URL /players/<slug>
    name          TEXT,               -- real name
    role          TEXT,
    country       TEXT,
    team          TEXT,
    is_retired    INTEGER,
    games         INTEGER,
    wins          INTEGER,
    kda           REAL,
    win_rate      REAL,
    intl_titles   INTEGER,
    worlds_titles INTEGER,
    msi_titles    INTEGER,
    worlds_appearances INTEGER,
    intl_games    INTEGER,
    kda_intl      REAL,
    score         INTEGER,     -- Legacy Score (see aggregate._legacy_score)
    score_breakdown TEXT,      -- JSON with the points breakdown
    image_filename TEXT,       -- profile photo (Leaguepedia Players.Image)
    image_url     TEXT,        -- CDN URL of the photo (built by MD5)
    team_logo_url TEXT         -- CDN URL of the current team's logo
);
CREATE INDEX IF NOT EXISTS idx_pidx_slug  ON player_index(slug);
CREATE INDEX IF NOT EXISTS idx_pidx_games ON player_index(games);

-- Champion pool per player (for the player page and champion records).
CREATE TABLE IF NOT EXISTS player_champions (
    player_id TEXT,
    champion  TEXT,
    games     INTEGER,
    wins      INTEGER,
    kills     INTEGER,
    deaths    INTEGER,
    assists   INTEGER,
    kda       REAL,
    PRIMARY KEY (player_id, champion)
);
CREATE INDEX IF NOT EXISTS idx_pchamp_player ON player_champions(player_id);

-- International titles won per player (trophy cabinet).
CREATE TABLE IF NOT EXISTS player_titles (
    player_id     TEXT,
    overview_page TEXT,
    event         TEXT,
    league        TEXT,
    year          TEXT,
    team          TEXT,          -- team they won with
    team_logo_url TEXT,          -- CDN URL of the team's logo
    PRIMARY KEY (player_id, overview_page)
);
CREATE INDEX IF NOT EXISTS idx_ptitles_player ON player_titles(player_id);

-- Team history per player (derived from the scoreboard: years and games).
CREATE TABLE IF NOT EXISTS player_teams (
    player_id     TEXT,
    team          TEXT,
    team_logo_url TEXT,
    first_year    TEXT,
    last_year     TEXT,
    games         INTEGER,
    PRIMARY KEY (player_id, team)
);
CREATE INDEX IF NOT EXISTS idx_pteams_player ON player_teams(player_id);

-- Champion stats (international level): most played / best win rate.
-- `role` slices the aggregate: 'all' plus one row per role the champion was played in.
CREATE TABLE IF NOT EXISTS champion_stats (
    champion  TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'all',  -- 'all' | Top | Jungle | Mid | Bot | Support
    games     INTEGER,
    wins      INTEGER,
    win_rate  REAL,
    kills     INTEGER,
    deaths    INTEGER,
    assists   INTEGER,
    kda       REAL,
    n_players INTEGER,
    PRIMARY KEY (champion, role)
);

-- ETL metadata (last run, schema version, attribution).
CREATE TABLE IF NOT EXISTS etl_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- =====================================================================
-- Oracle's Elixir (OE) silver — a SECOND source, additive to Leaguepedia.
-- Adds regional / second-tier league coverage + per-timing economy that
-- Cargo does not provide. Loaded by `python -m etl.oe_ingest` from the
-- per-year CSVs in data/raw/oe/. Curated column subset (not all 164).
-- OE.gameid == Leaguepedia scoreboard_games.RiotPlatformGameId (after
-- alphanumeric normalization) for overlapping games — see oe_player_link.
-- =====================================================================

-- One player per game (10 rows/game: participantid 1..10).
CREATE TABLE IF NOT EXISTS oe_player_games (
    gameid            TEXT,     -- OE platform game id (e.g. LOLTMNT03_329857)
    gameid_norm       TEXT,     -- alnum-uppercased, for the Leaguepedia join
    datacompleteness  TEXT,     -- complete / partial (partial lacks timings)
    league            TEXT,
    year              INTEGER,
    split             TEXT,
    playoffs          INTEGER,  -- 0 / 1
    date              TEXT,
    game              INTEGER,  -- game number within the series
    patch             TEXT,
    side              TEXT,     -- Blue / Red
    position          TEXT,     -- top / jng / mid / bot / sup
    role_number       INTEGER,  -- 1..5 from position (used by the crosswalk)
    participantid     INTEGER,
    playername        TEXT,
    playerid          TEXT,     -- OE stable player id
    teamname          TEXT,
    teamid            TEXT,
    champion          TEXT,
    result            INTEGER,  -- 1 win / 0 loss
    gamelength        INTEGER,  -- seconds
    kills             INTEGER,
    deaths            INTEGER,
    assists           INTEGER,
    doublekills       INTEGER,
    triplekills       INTEGER,
    quadrakills       INTEGER,
    pentakills        INTEGER,
    firstblood        INTEGER,
    damagetochampions INTEGER,
    dpm               REAL,
    damageshare       REAL,
    totalgold         INTEGER,
    earnedgold        INTEGER,
    total_cs          INTEGER,
    cspm              REAL,
    goldat10          INTEGER,
    csat10            INTEGER,
    xpat10            INTEGER,
    golddiffat10      REAL,
    csdiffat10        REAL,
    xpdiffat10        REAL,
    goldat15          INTEGER,
    csat15            INTEGER,
    xpat15            INTEGER,
    golddiffat15      REAL,
    csdiffat15        REAL,
    xpdiffat15        REAL,
    PRIMARY KEY (gameid, participantid)
);
CREATE INDEX IF NOT EXISTS idx_oepg_norm   ON oe_player_games(gameid_norm);
CREATE INDEX IF NOT EXISTS idx_oepg_player ON oe_player_games(playerid);
CREATE INDEX IF NOT EXISTS idx_oepg_league ON oe_player_games(league);

-- One team per game (2 rows/game: participantid 100/200, position='team').
CREATE TABLE IF NOT EXISTS oe_team_games (
    gameid            TEXT,
    gameid_norm       TEXT,
    datacompleteness  TEXT,
    league            TEXT,
    year              INTEGER,
    split             TEXT,
    playoffs          INTEGER,
    date              TEXT,
    game              INTEGER,
    patch             TEXT,
    side              TEXT,
    teamname          TEXT,
    teamid            TEXT,
    result            INTEGER,
    gamelength        INTEGER,
    kills             INTEGER,  -- team kills
    deaths            INTEGER,
    dragons           INTEGER,
    barons            INTEGER,
    towers            INTEGER,
    PRIMARY KEY (gameid, side)
);
CREATE INDEX IF NOT EXISTS idx_oetg_norm ON oe_team_games(gameid_norm);

-- Identity crosswalk: OE playerid -> Leaguepedia Link, derived from games
-- present in BOTH sources by aligning (normalized gameid, side, role) — no
-- name matching. OE-only (regional) players get link = NULL.
CREATE TABLE IF NOT EXISTS oe_player_link (
    playerid    TEXT PRIMARY KEY,  -- OE stable player id
    link        TEXT,              -- Leaguepedia Link (== Players.OverviewPage); NULL if OE-only
    playername  TEXT,              -- a representative OE handle
    n_games     INTEGER,           -- overlapping games backing the mapping
    n_conflicts INTEGER,           -- overlapping games that voted for another Link
    method      TEXT               -- 'gameid' (strong) | 'name' (handle + shared year/team) | NULL
);
CREATE INDEX IF NOT EXISTS idx_oelink_link ON oe_player_link(link);

-- League allowlist (dimension). Materialized from config.OE_LEAGUES by
-- etl.oe_ingest. OE ships 122 league codes, mostly academy/ERL tiers; the gold
-- layer joins against this table so only top-level leagues are aggregated.
-- `region` chains renames together (NA LCS / LCS / LTA N are all north_america)
-- so a career reads continuously across rebrands.
CREATE TABLE IF NOT EXISTS oe_leagues (
    league       TEXT PRIMARY KEY,  -- OE league code, as it appears in the CSVs
    scope        TEXT NOT NULL,     -- 'regional' | 'intl_secondary'
    region       TEXT NOT NULL,     -- stable region key across renames
    region_label TEXT NOT NULL,     -- display name
    tier         TEXT NOT NULL      -- 'major' | 'regional' | 'intl'
);

-- OE games Leaguepedia already has (matched on the normalized platform game id).
-- Leaguepedia is authoritative for these, so the gold layer excludes them from OE
-- aggregation or the game is counted twice. Rebuilt by etl.oe_ingest.
-- Within the allowlist these are the Worlds regional finals, which OE labels with
-- the modern league code (LEC/LCK/LCS/LMS/OGN) while Leaguepedia files them under
-- League='World Championship'.
CREATE TABLE IF NOT EXISTS oe_duplicate_games (
    gameid_norm TEXT PRIMARY KEY
);

-- Every OE player-game the gold layer is allowed to aggregate: allowlisted league,
-- not already in Leaguepedia, and resolved to a canonical player id — the
-- Leaguepedia Link when the crosswalk found one, otherwise the OE playerid, which
-- is how regional-only players enter the almanac.
-- Materialized (not a view) and indexed by player_id: the gold layer scans it once
-- per scope and once per player, and as a view over a 994k-row join each of those
-- was a full scan.
CREATE TABLE IF NOT EXISTS oe_resolved_games (
    player_id         TEXT NOT NULL,  -- Leaguepedia Link, or the OE playerid when unmapped
    is_leaguepedia    INTEGER,        -- 1 when the crosswalk resolved a Link
    -- 1 when Leaguepedia already has this game. Leaguepedia is authoritative for it,
    -- so ANY consumer counting games, wins or KDA must filter is_duplicate = 0 or it
    -- double-counts. The rows are kept because OE-exclusive columns (pentakills) have
    -- no Leaguepedia equivalent and would otherwise be lost for those games.
    is_duplicate      INTEGER,
    league_scope      TEXT,           -- 'regional' | 'intl_secondary' | 'intl_premier_oe'
    region            TEXT,
    region_label      TEXT,
    league            TEXT,
    year              INTEGER,
    position          TEXT,
    teamname          TEXT,
    champion          TEXT,
    datacompleteness  TEXT,
    result            INTEGER,
    kills             INTEGER,
    deaths            INTEGER,
    assists           INTEGER,
    pentakills        INTEGER,
    -- @15 snapshots: absolute values at a fixed timestamp, so averaging them is
    -- sound. CS/min and DPM are NOT averaged per game — they are derived from these
    -- totals, same rule as KDA.
    golddiffat15      REAL,
    goldat15          INTEGER,
    total_cs          INTEGER,
    damagetochampions INTEGER,
    gamelength        INTEGER,
    gameid            TEXT,
    gameid_norm       TEXT
);
CREATE INDEX IF NOT EXISTS idx_oerg_player ON oe_resolved_games(player_id);
CREATE INDEX IF NOT EXISTS idx_oerg_scope  ON oe_resolved_games(league_scope, region);
