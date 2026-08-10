"""ETL configuration: Cargo -> SQLite table specs, tiers and constants.

The silver-layer SQLite columns are named the same as the Cargo fields, so the
loader inserts the row-dicts without mapping. See db/schema.sql.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --- Paths ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "site.sqlite"
SCHEMA_PATH = ROOT / "db" / "schema.sql"
STATE_PATH = ROOT / "etl" / "state" / "watermarks.json"


# --- .env loading (no dependencies) --------------------------------------
def load_dotenv(path: Path = ROOT / ".env") -> list[str]:
    """Populates os.environ from a .env in the root. Tolerates 'export', quotes,
    comments and CRLF. Does not override already-defined variables. Returns the loaded keys."""
    loaded: list[str] = []
    if not path.exists():
        return loaded
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip().lstrip("﻿")
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)
            loaded.append(key)
    return loaded


load_dotenv()

# --- API / client --------------------------------------------------------
WIKI = "lol"
# Descriptive User-Agent with contact (good citizenship; the anonymous API limits hard).
USER_AGENT = "smurfeando/0.1 (https://github.com/; contact: federicoterpin@gmail.com)"
# Per-page cap: 500 anonymous, 5000 with a logged-in bot account.
PAGE_SIZE_ANON = 500
PAGE_SIZE_BOT = 5000
# ADAPTIVE throttle (AIMD). Leaguepedia uses a token-bucket (~4-5) that refills slowly,
# and hitting it while you are limited EXTENDS the penalty. Hence: start from a
# conservative interval, raise it aggressively on rate-limit and lower it slowly on
# success, and on rate-limit wait QUIETLY (no eager retries). With 'noratelimit' (bot
# group) the interval goes to 0.
# Logged-in sessions (bot password + confirmed email) get `cargo-query: 60/60s` from
# the server (verified 2026-08-10 via meta=userinfo&uiprop=ratelimits), so they use a
# lower floor; the harsh ~1-per-30s regime only applies to anonymous requests.
MIN_REQUEST_INTERVAL = 5.0        # floor of the adaptive interval (anonymous)
MIN_REQUEST_INTERVAL_AUTH = 2.0   # floor for authenticated sessions (~30/min max)
MAX_INTERVAL = 30.0          # ceiling of the adaptive interval
MAX_RETRIES = 10             # patient: do not give up the backfill over rate-limit
RATELIMIT_COOLDOWN = 25.0    # base quiet wait on 'ratelimited' (grows per attempt)
MAX_LAG = 5                  # honor the server's maxlag

# --- Tiers ---------------------------------------------------------------
# League strings verified live (Phase 0): the World Championship is 'World Championship'
# (NOT 'Worlds'); MSI is 'Mid-Season Invitational'; the new event is 'First Stand'.
# Region='International' confirmed. Rift Rivals/All-Star use per-year names
# (e.g. 'All-Star 2014 Paris', 'Rift Rivals 2017 NA-EU') -> classify by substring.
PREMIER_LEAGUES = {"World Championship", "Mid-Season Invitational", "First Stand"}
# Substrings (lowercase) that mark an exhibition within international events.
EXHIBITION_SUBSTRINGS = ("all-star", "mid-season cup", "showmatch", "nexus blitz",
                          "legends match", "showtime")
INTERNATIONAL_REGION = "International"


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"1", "yes", "true", "y", "t"}


def classify_tier(league, region, is_playoffs, is_qualifier=None, tournament_level=None) -> str:
    """Classifies a tournament into one of the 6 tiers. See plan §4.

    Premier = exact match (drives the headline record). The rest of the events with
    Region='International' fall into intl_legacy except exhibitions (by substring).
    Regional ones are split by the IsPlayoffs flag — but ONLY the top-tier league of
    each region (LP_PRO_LEAGUES) plus premier qualifiers/regional finals qualify;
    everything else on the wiki (academy, development, ERLs, amateur circuits) is
    'other' and never reaches the gold layer.
    """
    league = (league or "").strip()
    region = (region or "").strip()
    low = league.lower()
    is_intl = region == INTERNATIONAL_REGION
    # NOTE: Worlds qualifiers/regional finals carry League='World Championship' but a
    # regional Region (Europe/Korea/...) -> they are NOT intl_premier. Require both.
    if is_intl and league in PREMIER_LEAGUES:
        return "intl_premier"
    if is_intl:
        if any(sub in low for sub in EXHIBITION_SUBSTRINGS):
            return "exhibition"
        return "intl_legacy"
    if league not in LP_PRO_LEAGUES and league not in PREMIER_LEAGUES:
        return "other"
    if _truthy(is_playoffs):
        return "regional_playoffs"
    return "regional_regular"


# Tiers that count as professional play: everything the gold layer aggregates
# ('all' scope, champion pools, team rosters). 'exhibition' and 'other' stay out.
PRO_TIERS = ("intl_premier", "intl_legacy", "regional_playoffs", "regional_regular")

# --- Leaguepedia pro-league allowlist -------------------------------------
# The full backfill pulls EVERY tournament on the wiki — including development
# (LDL, LSPL), academy and amateur circuits that do not belong in a records
# almanac. This maps the TOP-TIER league of each region to the same region keys
# the web already uses (== oe_leagues.region), chained across renames exactly
# like OE_LEAGUES below. Keys are Tournaments.League values verified against
# the full silver (2026-08-10). Premier qualifiers/regional finals are pro too
# but carry League='World Championship' etc. — classify_tier handles them; they
# belong to no region.
LP_PRO_LEAGUES = {
    # China
    "Tencent LoL Pro League": "china",
    # Korea (OGN Champions era, then LCK)
    "LoL The Champions": "korea",
    "LoL Champions Korea": "korea",
    # Europe (EU LCS era, then LEC — LEC rows carry Region 'Europe' AND 'EMEA')
    "Europe League Championship Series": "europe",
    "LoL EMEA Championship": "europe",
    # North America (NA LCS era, then LCS, plus the 2025 LTA North conference)
    "North America League Championship Series": "north_america",
    "League of Legends Championship Series": "north_america",
    "League of Legends Championship of The Americas North": "north_america",
    # Americas (2025 unified LTA cross-conference event)
    "League of Legends Championship of The Americas": "americas",
    # Latin America (Copa Norte/Sur era, then LLN, then unified LLA, then LTA South)
    "Copa Latinoamérica Norte": "latam",
    "Copa Latinoamérica Sur": "latam",
    "Liga Latinoamérica Norte": "latam",
    "Liga Latinoamerica": "latam",
    "League of Legends Championship of The Americas South": "latam",
    # Pacific (LMS era, then PCS, then LCP)
    "LoL Master Series": "pacific",
    "Pacific Championship Series": "pacific",
    "League of Legends Championship Pacific": "pacific",
    # Single-league regions
    "Circuit Brazilian League of Legends": "brazil",
    "LoL Japan League": "japan",
    "Turkish Championship League": "turkey",
    "Vietnam Championship Series": "vietnam",
    # Oceania (OPL era, then LCO)
    "Oceanic Pro League": "oceania",
    "LoL Circuit Oceania": "oceania",
}


def league_region(league) -> str | None:
    """Region key for a pro regional league; None if the league is not allowlisted."""
    return LP_PRO_LEAGUES.get((league or "").strip())


# --- Oracle's Elixir: league allowlist -----------------------------------
# OE ships 122 league codes / ~99k games, mostly academy and ERL tiers that do
# not belong in a records almanac. This allowlist keeps the TOP-LEVEL league of
# each major region, CHAINED ACROSS RENAMES so a career reads continuously
# (NA LCS 2014-18 -> LCS 2019-24 -> LTA N 2025 -> LCS 2026 are all one region).
# It is materialized into the oe_leagues dimension table by etl.oe_ingest; the
# gold layer joins against it. The silver tables stay faithful to the source,
# so changing this list only requires re-running the materialization.
#
# scope  — 'regional' (domestic league) or 'intl_secondary' (international event
#          that the Leaguepedia backfill does not cover; NOT premier, so it does
#          not feed the Legacy Score).
# region — the continuous competitive region, stable across renames.
# tier   — 'major' for the four historically-major regions, else 'regional'.
OE_SCOPE_REGIONAL = "regional"
OE_SCOPE_INTL_SECONDARY = "intl_secondary"
# OE's own copy of the premier internationals. Leaguepedia is authoritative for
# every one of these games, so they are all flagged is_duplicate and contribute
# NOTHING to the regional scopes. They are listed only so OE-exclusive stats can
# count a full career: pentakills exist in no Leaguepedia table, and leaving these
# games out would rank Peyz (7 regional + 2 at internationals) below Ruler instead
# of tied with him.
OE_SCOPE_INTL_PREMIER = "intl_premier_oe"

# league code -> (scope, region key, region label, tier)
OE_LEAGUES: dict[str, tuple[str, str, str, str]] = {
    # --- Korea: OGN Champions -> LCK -------------------------------------
    "OGN":    (OE_SCOPE_REGIONAL, "korea", "Korea", "major"),          # 2015
    "LCK":    (OE_SCOPE_REGIONAL, "korea", "Korea", "major"),          # 2016-
    # --- China -----------------------------------------------------------
    "LPL":    (OE_SCOPE_REGIONAL, "china", "China", "major"),          # 2016-
    # --- Europe: EU LCS -> LEC -------------------------------------------
    "EU LCS": (OE_SCOPE_REGIONAL, "europe", "Europe", "major"),        # 2014-2018
    "LEC":    (OE_SCOPE_REGIONAL, "europe", "Europe", "major"),        # 2019-
    # --- North America: NA LCS -> LCS -> LTA N -> LCS ---------------------
    "NA LCS": (OE_SCOPE_REGIONAL, "north_america", "North America", "major"),  # 2014-2018
    "LCS":    (OE_SCOPE_REGIONAL, "north_america", "North America", "major"),  # 2019-2024, 2026
    "LTA N":  (OE_SCOPE_REGIONAL, "north_america", "North America", "major"),  # 2025-
    # --- Latin America: CLS + LLN -> LLA -> LTA S ------------------------
    "CLS":    (OE_SCOPE_REGIONAL, "latam", "Latin America", "regional"),  # 2016-2018 (south)
    "LLN":    (OE_SCOPE_REGIONAL, "latam", "Latin America", "regional"),  # 2017-2018 (north)
    "LLA":    (OE_SCOPE_REGIONAL, "latam", "Latin America", "regional"),  # 2019-2024
    "LTA S":  (OE_SCOPE_REGIONAL, "latam", "Latin America", "regional"),  # 2025-
    # --- Brazil ----------------------------------------------------------
    "CBLOL":  (OE_SCOPE_REGIONAL, "brazil", "Brazil", "regional"),      # 2015-
    # --- Americas: LTA cross-conference championship (NA + LatAm + BR) ---
    "LTA":    (OE_SCOPE_REGIONAL, "americas", "Americas", "regional"),  # 2025
    # --- Pacific: LMS -> PCS -> LCP --------------------------------------
    "LMS":    (OE_SCOPE_REGIONAL, "pacific", "Pacific", "regional"),    # 2015-2019
    "PCS":    (OE_SCOPE_REGIONAL, "pacific", "Pacific", "regional"),    # 2020-
    "LCP":    (OE_SCOPE_REGIONAL, "pacific", "Pacific", "regional"),    # 2025- (absorbs PCS/LJL/VCS as tier 1)
    # --- Other tier-1 domestic leagues -----------------------------------
    "VCS":    (OE_SCOPE_REGIONAL, "vietnam", "Vietnam", "regional"),    # 2018-
    "LJL":    (OE_SCOPE_REGIONAL, "japan", "Japan", "regional"),        # 2016-
    "TCL":    (OE_SCOPE_REGIONAL, "turkey", "Turkey", "regional"),      # 2015-
    "OPL":    (OE_SCOPE_REGIONAL, "oceania", "Oceania", "regional"),    # 2015-2020
    "LCO":    (OE_SCOPE_REGIONAL, "oceania", "Oceania", "regional"),    # 2021-2024
    # --- International events outside the Leaguepedia backfill -----------
    # Real international events, but NOT premier: they go to their own scope and
    # never feed the Legacy Score (that stays Worlds/MSI/First Stand only).
    # NOTE: the 2020 Mid-Season Cup ('MSC', 25 games) is deliberately absent —
    # 'mid-season cup' is in EXHIBITION_SUBSTRINGS, so Leaguepedia-sourced data
    # already treats it as an exhibition. Including it here would contradict that.
    "EWC":    (OE_SCOPE_INTL_SECONDARY, "international", "International", "intl"),  # Esports World Cup, 2024-
    "IEM":    (OE_SCOPE_INTL_SECONDARY, "international", "International", "intl"),  # Intel Extreme Masters, 2015-2017
    "IWCI":   (OE_SCOPE_INTL_SECONDARY, "international", "International", "intl"),  # Wildcard Invitational, 2016
    # --- Premier internationals: Leaguepedia's, seen from OE's side -------
    # Never aggregated (all duplicates); see OE_SCOPE_INTL_PREMIER.
    "WLDs":   (OE_SCOPE_INTL_PREMIER, "premier", "Premier (Leaguepedia's)", "intl"),
    "MSI":    (OE_SCOPE_INTL_PREMIER, "premier", "Premier (Leaguepedia's)", "intl"),
    "FST":    (OE_SCOPE_INTL_PREMIER, "premier", "Premier (Leaguepedia's)", "intl"),
}

# Minimum 'complete' games for a player to enter an economy leaderboard
# (GD@15, gold@15, CS/min). OE marks a game 'partial' when it lacks the @10/@15
# timings AND the multikill columns — notably the LPL has NO timings from 2022
# on, so these rankings are computed over complete games only, with a coverage
# note in the UI. See docs/oracles-elixir-integration.md.
OE_MIN_COMPLETE_GAMES = 50


def oe_league_rows() -> list[tuple[str, str, str, str, str]]:
    """OE_LEAGUES flattened for insertion into the oe_leagues dimension table."""
    return [(lg, scope, key, label, tier)
            for lg, (scope, key, label, tier) in OE_LEAGUES.items()]


# --- Table specs ---------------------------------------------------------
@dataclass
class TableSpec:
    name: str                       # silver table in SQLite
    cargo_table: str                # source Cargo table
    fields: list[str]               # Cargo fields (== SQLite columns)
    # Request-side field expressions when they differ from the columns — needed for
    # API aliases like '_pageName=Page' (bare _pageName is rejected by cargoquery).
    # The response row then carries the alias ('Page'), matching `fields`.
    cargo_fields: list[str] | None = None
    pk: list[str] = field(default_factory=list)
    int_fields: set[str] = field(default_factory=set)
    float_fields: set[str] = field(default_factory=set)
    bool_fields: set[str] = field(default_factory=set)
    date_field: str | None = None   # for incremental/watermark
    scope_field: str | None = None  # field to filter by tournament (slice)
    order_by: str | None = None

    @property
    def numeric_fields(self) -> set[str]:
        return self.int_fields | self.float_fields | self.bool_fields


TABLES: dict[str, TableSpec] = {
    "tournaments": TableSpec(
        name="tournaments", cargo_table="Tournaments",
        fields=["OverviewPage", "Name", "League", "Region", "Year", "TournamentLevel",
                "IsQualifier", "IsPlayoffs", "IsOfficial", "Date", "DateStart", "Split", "Prizepool"],
        pk=["OverviewPage"],
        bool_fields={"IsQualifier", "IsPlayoffs", "IsOfficial"},
        date_field="DateStart", scope_field="OverviewPage", order_by="DateStart",
    ),
    "scoreboard_games": TableSpec(
        name="scoreboard_games", cargo_table="ScoreboardGames",
        fields=["GameId", "MatchId", "OverviewPage", "Tournament", "Team1", "Team2",
                "WinTeam", "LossTeam", "Winner", "Team1Score", "Team2Score",
                "DateTime_UTC", "Gamelength_Number", "Patch", "RiotPlatformGameId", "RiotGameId"],
        pk=["GameId"],
        int_fields={"Winner", "Team1Score", "Team2Score"},
        float_fields={"Gamelength_Number"},
        date_field="DateTime_UTC", scope_field="OverviewPage", order_by="DateTime_UTC",
    ),
    "scoreboard_players": TableSpec(
        name="scoreboard_players", cargo_table="ScoreboardPlayers",
        fields=["UniqueLine", "Link", "Name", "Champion", "Kills", "Deaths", "Assists",
                "Gold", "CS", "DamageToChampions", "VisionScore", "Role", "Role_Number",
                "Side", "Team", "TeamKills", "PlayerWin", "DateTime_UTC", "Tournament",
                "OverviewPage", "GameId", "MatchId"],
        pk=["UniqueLine"],
        int_fields={"Kills", "Deaths", "Assists", "Gold", "CS", "DamageToChampions",
                    "VisionScore", "Role_Number", "Side", "TeamKills"},
        date_field="DateTime_UTC", scope_field="OverviewPage", order_by="DateTime_UTC",
    ),
    "players": TableSpec(
        name="players", cargo_table="Players",
        fields=["OverviewPage", "ID", "Name", "NativeName", "Country", "Nationality",
                "NationalityPrimary", "Residency", "Role", "Team", "Birthdate",
                "IsRetired", "IsSubstitute", "Image"],
        pk=["OverviewPage"],
        bool_fields={"IsRetired", "IsSubstitute"},
        scope_field="OverviewPage",   # filter by list of Links
    ),
    "player_redirects": TableSpec(
        name="player_redirects", cargo_table="PlayerRedirects",
        fields=["AllName", "OverviewPage", "ID"],
        pk=["AllName"],
        scope_field="OverviewPage",
    ),
    "tournament_results": TableSpec(
        name="tournament_results", cargo_table="TournamentResults",
        fields=["OverviewPage", "Event", "Place", "Place_Number", "Team", "RosterPage",
                "PageAndTeam", "Prize", "Qualified"],
        pk=[],  # composite UNIQUE in the schema
        int_fields={"Place_Number"},
        bool_fields={"Qualified"},
        scope_field="OverviewPage",
    ),
    "tournament_players": TableSpec(
        name="tournament_players", cargo_table="TournamentPlayers",
        fields=["OverviewPage", "Team", "Link", "Player", "Role", "PageAndTeam",
                "N_PlayerInTeam", "TeamOrder"],
        pk=[],  # composite UNIQUE in the schema
        int_fields={"N_PlayerInTeam", "TeamOrder"},
        scope_field="OverviewPage",
    ),
    # Team registry (full sweeps, no scope): org renames chain through
    # Teams.RenamedTo; name variants resolve through TeamRedirects. Pulled by
    # `python -m etl.fetch_teams`; the transform degrades to identity mapping
    # when these are empty.
    "teams": TableSpec(
        name="teams", cargo_table="Teams",
        fields=["Name", "OverviewPage", "Short", "Region", "IsDisbanded", "RenamedTo"],
        pk=["OverviewPage"],
        bool_fields={"IsDisbanded"},
    ),
    "team_redirects": TableSpec(
        name="team_redirects", cargo_table="TeamRedirects",
        fields=["AllName", "Page"],
        cargo_fields=["AllName", "_pageName=Page"],
        pk=["AllName"],
    ),
}

# Load order (by logical dependencies, not FK).
LOAD_ORDER = [
    "tournaments", "scoreboard_games", "scoreboard_players",
    "tournament_results", "tournament_players", "players", "player_redirects",
    "teams", "team_redirects",
]

# Minimum sample thresholds (games) per leaderboard. See plan §4.
THRESHOLDS = {
    "career_kda": 200,
    "career_kda_intl": 30,
    "win_rate": 200,
    "single_tournament_kda": 5,
    "champion_win_rate": 15,
    # Regional scopes: samples are far larger than international ones (a domestic
    # season is ~100 games), so 100 keeps 58-183 qualifiers per region instead of
    # the handful 200 would leave in the smaller ones.
    "regional_kda": 100,
    "regional_win_rate": 100,
}

ATTRIBUTION = {
    "leaguepedia": "Data: Leaguepedia (lol.fandom.com), CC BY-SA 4.0",
    "oracles_elixir": "Data courtesy of Oracle's Elixir (Tim Sevenhuysen)",
}
