"""Transform GOLD: tiers, career stats (per scope/role), leaderboards, champion
pool, titles, champion stats, player index and records.

KDA rule (non-negotiable): (ΣK+ΣA)/ΣD from raw totals, never an average of per-game
ratios. MAX(deaths,1) is used in the denominator for the deaths=0 case.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3

from etl import config

ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]
OE_POSITION_TO_ROLE = {"top": "Top", "jng": "Jungle", "mid": "Mid",
                       "bot": "Bot", "sup": "Support"}

# --- Fandom CDN image URLs (no UA blocking; built by MD5) ---
_CDN = "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images"


def cdn_image(filename):
    """Direct URL to a Leaguepedia image given its file name."""
    if not filename:
        return None
    fn = str(filename).replace(" ", "_")
    h = hashlib.md5(fn.encode("utf-8")).hexdigest()
    return f"{_CDN}/{h[0]}/{h[:2]}/{fn}"


def team_logo(team):
    """URL of a team's square logo (Leaguepedia uses '<Team>logo square.png')."""
    if not team:
        return None
    return cdn_image(f"{team}logo square.png")


# ---------------------------------------------------------------------------
def compute_tiers(conn: sqlite3.Connection) -> None:
    conn.create_function("classify_tier", 3,
                         lambda lg, rg, pl: config.classify_tier(lg, rg, pl))
    conn.execute("UPDATE tournaments SET Tier = classify_tier(League, Region, IsPlayoffs)")
    conn.commit()


# ---------------------------------------------------------------------------
def _career_query(where_extra: str = "") -> str:
    conditions = ["SP.Link IS NOT NULL", "SP.Link <> ''"]
    if where_extra:
        conditions.append(where_extra)
    where = " AND ".join(conditions)
    return f"""
        SELECT
            SP.Link AS player_id,
            COALESCE(P.ID, SP.Link) AS display_id,
            COUNT(DISTINCT SP.GameId) AS games,
            SUM(CASE WHEN SP.PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
            SUM(COALESCE(SP.Kills, 0))   AS kills,
            SUM(COALESCE(SP.Deaths, 0))  AS deaths,
            SUM(COALESCE(SP.Assists, 0)) AS assists
        FROM scoreboard_players SP
        LEFT JOIN players P ON P.OverviewPage = SP.Link
        LEFT JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
        WHERE {where}
        GROUP BY SP.Link
    """


def compute_career_stats(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_career_stats")
    scopes = [("all", ""), ("intl_premier", "T.Tier = 'intl_premier'")]
    scopes += [(f"role:{r}", f"SP.Role = '{r}'") for r in ROLES]
    for scope, extra in scopes:
        rows = conn.execute(_career_query(extra)).fetchall()
        payload = []
        for r in rows:
            kills, deaths, assists = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
            games, wins = r["games"] or 0, r["wins"] or 0
            if not games:
                continue
            kda = (kills + assists) / max(deaths, 1)
            payload.append((r["player_id"], scope, r["display_id"], games, wins,
                            games - wins, kills, deaths, assists, round(kda, 4),
                            round(wins / games, 4)))
        conn.executemany(
            """INSERT INTO player_career_stats
               (player_id, scope, display_id, games, wins, losses, kills, deaths,
                assists, kda, win_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


# ---------------------------------------------------------------------------
def _has_oe(conn: sqlite3.Connection) -> bool:
    """Whether Oracle's Elixir silver has been ingested (etl.oe_ingest)."""
    if not conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' "
                        "AND name = 'oe_resolved_games'").fetchone()[0]:
        return False
    return bool(conn.execute("SELECT COUNT(*) FROM oe_resolved_games").fetchone()[0])


# Oracle's Elixir scopes. `all` and `intl_premier` stay Leaguepedia-only so no
# existing record moves; regional play lands here instead.
def _oe_career_query(where_extra: str) -> str:
    return f"""
        SELECT
            player_id,
            COUNT(DISTINCT gameid)          AS games,
            SUM(COALESCE(result, 0))        AS wins,
            SUM(COALESCE(kills, 0))         AS kills,
            SUM(COALESCE(deaths, 0))        AS deaths,
            SUM(COALESCE(assists, 0))       AS assists,
            -- @15 economy: only the games that actually carry the timings.
            SUM(golddiffat15 IS NOT NULL)   AS economy_games,
            AVG(golddiffat15)               AS gd15,
            AVG(goldat15)                   AS gold15,
            SUM(COALESCE(total_cs, 0))            AS cs,
            SUM(COALESCE(damagetochampions, 0))   AS damage,
            SUM(COALESCE(gamelength, 0))          AS seconds,
            SUM(COALESCE(pentakills, 0))          AS pentakills
        FROM oe_resolved_games
        WHERE {where_extra}
        GROUP BY player_id
    """


def _oe_scopes(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """(scope name, WHERE clause) for every OE scope: the combined regional one, one
    per region, and the secondary internationals.

    Every clause carries is_duplicate = 0. The premier internationals OE also ships
    are entirely duplicates of Leaguepedia's, so they get no scope of their own —
    they exist in oe_resolved_games only for pentakills (see compute_pentakills).
    """
    dedup = "is_duplicate = 0 AND "
    scopes = [
        (config.OE_SCOPE_REGIONAL, dedup + "league_scope = 'regional'"),
        (config.OE_SCOPE_INTL_SECONDARY, dedup + "league_scope = 'intl_secondary'"),
    ]
    regions = conn.execute(
        "SELECT DISTINCT region FROM oe_leagues WHERE scope = 'regional' ORDER BY region")
    scopes += [(f"region:{r[0]}", dedup + f"league_scope = 'regional' AND region = '{r[0]}'")
               for r in regions]
    return scopes


def compute_oe_career_stats(conn: sqlite3.Connection) -> None:
    """Regional / secondary-international career stats, added to player_career_stats
    alongside the Leaguepedia-sourced scopes."""
    for scope, where in _oe_scopes(conn):
        conn.execute("DELETE FROM player_career_stats WHERE scope = ?", (scope,))
        payload = []
        for r in conn.execute(_oe_career_query(where)).fetchall():
            games, wins = r["games"] or 0, r["wins"] or 0
            if not games:
                continue
            kills, deaths, assists = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
            minutes = (r["seconds"] or 0) / 60.0
            payload.append((
                r["player_id"], scope, None, games, wins, games - wins,
                kills, deaths, assists,
                round((kills + assists) / max(deaths, 1), 4),
                round(wins / games, 4),
                r["economy_games"] or 0,
                round(r["gd15"], 1) if r["gd15"] is not None else None,
                round(r["gold15"], 1) if r["gold15"] is not None else None,
                round((r["cs"] or 0) / minutes, 2) if minutes else None,
                round((r["damage"] or 0) / minutes, 1) if minutes else None,
                r["pentakills"] or 0,
            ))
        conn.executemany(
            """INSERT OR REPLACE INTO player_career_stats
               (player_id, scope, display_id, games, wins, losses, kills, deaths,
                assists, kda, win_rate, economy_games, gd15, gold15, cs_per_min, dpm,
                pentakills)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", payload)
    # display_id is filled in once the index knows each player's canonical handle.
    conn.execute("""
        UPDATE player_career_stats SET display_id = COALESCE(
            (SELECT P.ID FROM players P WHERE P.OverviewPage = player_career_stats.player_id),
            (SELECT pl.playername FROM oe_player_link pl
              WHERE pl.playerid = player_career_stats.player_id),
            player_id)
        WHERE display_id IS NULL""")
    conn.commit()


# ---------------------------------------------------------------------------
def compute_player_champions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_champions")
    rows = conn.execute("""
        SELECT Link AS player_id, Champion AS champion,
               COUNT(DISTINCT GameId) AS games,
               SUM(CASE WHEN PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
               SUM(COALESCE(Kills, 0)) AS k, SUM(COALESCE(Deaths, 0)) AS d,
               SUM(COALESCE(Assists, 0)) AS a
        FROM scoreboard_players
        WHERE Link IS NOT NULL AND Link <> '' AND Champion IS NOT NULL AND Champion <> ''
        GROUP BY Link, Champion""").fetchall()
    payload = [(r["player_id"], r["champion"], r["games"], r["wins"], r["k"], r["d"],
                r["a"], round((r["k"] + r["a"]) / max(r["d"], 1), 4)) for r in rows]
    conn.executemany(
        """INSERT INTO player_champions
           (player_id, champion, games, wins, kills, deaths, assists, kda)
           VALUES (?,?,?,?,?,?,?,?)""", payload)
    # Champion pool for regional-only players, whose games Leaguepedia does not have
    # at all. Restricted to is_leaguepedia = 0 so the pools of players who appear in
    # both sources keep being the Leaguepedia-sourced international ones.
    if _has_oe(conn):
        conn.execute("""
            INSERT INTO player_champions
                (player_id, champion, games, wins, kills, deaths, assists, kda)
            SELECT player_id, champion, COUNT(*), SUM(COALESCE(result, 0)),
                   SUM(COALESCE(kills, 0)), SUM(COALESCE(deaths, 0)), SUM(COALESCE(assists, 0)),
                   ROUND((SUM(COALESCE(kills, 0)) + SUM(COALESCE(assists, 0)))
                         / CAST(MAX(SUM(COALESCE(deaths, 0)), 1) AS REAL), 4)
            FROM oe_resolved_games
            WHERE is_duplicate = 0 AND is_leaguepedia = 0
              AND champion IS NOT NULL AND champion <> ''
            GROUP BY player_id, champion""")
    conn.commit()


def _first_year(text):
    m = re.search(r"(20\d{2})", str(text or ""))
    return m.group(1) if m else None


def compute_player_teams(conn: sqlite3.Connection) -> None:
    """Team history: per (player, team), first/last year and games."""
    conn.create_function("team_logo", 1, team_logo)
    conn.execute("DELETE FROM player_teams")
    conn.execute("""
        INSERT INTO player_teams (player_id, team, team_logo_url, first_year, last_year, games)
        SELECT Link, Team, team_logo(Team),
               MIN(substr(DateTime_UTC, 1, 4)), MAX(substr(DateTime_UTC, 1, 4)),
               COUNT(DISTINCT GameId)
        FROM scoreboard_players
        WHERE Link IS NOT NULL AND Link <> '' AND Team IS NOT NULL AND Team <> ''
        GROUP BY Link, Team""")
    # Team history for regional-only players (see compute_player_champions).
    if _has_oe(conn):
        conn.execute("""
            INSERT INTO player_teams
                (player_id, team, team_logo_url, first_year, last_year, games)
            SELECT player_id, teamname, team_logo(teamname),
                   CAST(MIN(year) AS TEXT), CAST(MAX(year) AS TEXT), COUNT(*)
            FROM oe_resolved_games
            WHERE is_duplicate = 0 AND is_leaguepedia = 0
              AND teamname IS NOT NULL AND teamname <> ''
            GROUP BY player_id, teamname""")
    conn.commit()


def compute_player_titles(conn: sqlite3.Connection) -> None:
    conn.create_function("team_logo", 1, team_logo)
    conn.create_function("first_year", 1, _first_year)
    conn.execute("DELETE FROM player_titles")
    conn.execute("""
        INSERT OR IGNORE INTO player_titles
            (player_id, overview_page, event, league, year, team, team_logo_url)
        SELECT DISTINCT TP.Link, T.OverviewPage, T.Name, T.League,
               COALESCE(NULLIF(T.Year, ''), first_year(T.Name), first_year(T.OverviewPage)),
               TR.Team, team_logo(TR.Team)
        FROM tournament_results TR
        JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
        JOIN tournament_players TP ON TP.PageAndTeam = TR.PageAndTeam
        WHERE T.Tier = 'intl_premier' AND TRIM(TR.Place) = '1'
          AND TP.Link IS NOT NULL AND TP.Link <> ''
          AND EXISTS (SELECT 1 FROM scoreboard_players SP
                      WHERE SP.Link = TP.Link AND SP.OverviewPage = TP.OverviewPage)""")
    conn.commit()


# ---------------------------------------------------------------------------
# Teams gold: canonical registry + rosters + intl podiums.

# Union of every (team, player, game) across both sources. Disjoint by
# construction: Leaguepedia holds the internationals and is_duplicate = 0
# excludes OE's copies of those same games.
_TEAM_GAMES_UNION = """
    SELECT ta.team_id AS team_id, SP.Link AS player_id,
           substr(SP.DateTime_UTC, 1, 4) AS y, SP.GameId AS gid, SP.Role AS role
    FROM scoreboard_players SP
    JOIN team_aliases ta ON ta.alias = SP.Team
    WHERE SP.Link IS NOT NULL AND SP.Link <> ''
    UNION ALL
    SELECT ta.team_id, g.player_id, CAST(g.year AS TEXT), g.gameid,
           CASE g.position WHEN 'top' THEN 'Top' WHEN 'jng' THEN 'Jungle'
                WHEN 'mid' THEN 'Mid' WHEN 'bot' THEN 'Bot' WHEN 'sup' THEN 'Support'
           END
    FROM oe_resolved_games g
    JOIN team_aliases ta ON ta.alias = g.teamname
    WHERE g.is_duplicate = 0
"""


def _team_resolver(conn: sqlite3.Connection):
    """(canon, meta) — canon(raw name) -> canonical wiki page after resolving
    redirects and following the RenamedTo chain; meta(page) -> teams row or None.
    Identity when the registry has not been pulled, so offline builds keep working
    with raw names."""
    have = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN "
        "('teams', 'team_redirects')")}
    if have != {"teams", "team_redirects"}:
        return (lambda n: n), (lambda p: None)
    redirects = {r["AllName"].lower(): r["Page"] for r in conn.execute(
        "SELECT AllName, Page FROM team_redirects WHERE Page IS NOT NULL AND Page <> ''")}
    teams = {r["OverviewPage"]: r for r in conn.execute("SELECT * FROM teams")}
    if not redirects and not teams:
        return (lambda n: n), (lambda p: None)

    def canon(name: str) -> str:
        page = redirects.get(name.lower(), name)
        seen = {page}
        # RenamedTo is a NAME, not a page: re-resolve each hop through redirects.
        for _ in range(10):
            row = teams.get(page)
            nxt = (row["RenamedTo"] or "").strip() if row else ""
            if not nxt:
                break
            nxt_page = redirects.get(nxt.lower(), nxt)
            if nxt_page in seen:   # cycle guard
                break
            seen.add(nxt_page)
            page = nxt_page
        return page

    return canon, teams.get


def compute_teams(conn: sqlite3.Connection) -> None:
    """team_aliases -> team_rosters -> team_podiums -> team_index.

    Runs after compute_player_index (is_current needs player_index.team)."""
    conn.create_function("team_logo", 1, team_logo)
    conn.create_function("first_year", 1, _first_year)
    canon, team_meta = _team_resolver(conn)

    # -- aliases: every raw team string the gold layer can display ---------
    raw_names = [r[0] for r in conn.execute("""
        SELECT DISTINCT Team FROM scoreboard_players WHERE Team IS NOT NULL AND Team <> ''
        UNION SELECT DISTINCT teamname FROM oe_resolved_games
              WHERE teamname IS NOT NULL AND teamname <> ''
        UNION SELECT DISTINCT Team FROM players WHERE Team IS NOT NULL AND Team <> ''
        UNION SELECT DISTINCT TR.Team FROM tournament_results TR
              JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
              WHERE T.Tier = 'intl_premier' AND TR.Team IS NOT NULL AND TRIM(TR.Team) <> ''
    """)]
    conn.execute("DELETE FROM team_aliases")
    conn.executemany("INSERT OR IGNORE INTO team_aliases (alias, team_id) VALUES (?, ?)",
                     [(name, canon(name)) for name in raw_names])

    # -- all-time rosters --------------------------------------------------
    conn.execute("DELETE FROM team_rosters")
    conn.execute(f"""
        INSERT INTO team_rosters
            (team_id, player_id, role, first_year, last_year, games, is_current)
        SELECT team_id, player_id, NULL, MIN(y), MAX(y), COUNT(DISTINCT gid), 0
        FROM ({_TEAM_GAMES_UNION})
        GROUP BY team_id, player_id""")
    # Most-played role per (team, player): ascending count, last write wins.
    top_role = {(r[0], r[1]): r[2] for r in conn.execute(f"""
        SELECT team_id, player_id, role FROM ({_TEAM_GAMES_UNION})
        WHERE role IS NOT NULL AND role <> ''
        GROUP BY team_id, player_id, role ORDER BY COUNT(*)""")}
    conn.executemany(
        "UPDATE team_rosters SET role = ? WHERE team_id = ? AND player_id = ?",
        [(role, team_id, player_id) for (team_id, player_id), role in top_role.items()])
    conn.execute("""
        UPDATE team_rosters SET is_current = EXISTS (
            SELECT 1 FROM player_index pi
            JOIN team_aliases ta ON ta.alias = pi.team
            WHERE pi.player_id = team_rosters.player_id
              AND ta.team_id = team_rosters.team_id)""")

    # -- top-3 finishes at premier internationals --------------------------
    # Place_Number is empty on many rows -> trust the Place text. The Team <> ''
    # guard drops the placeholder rows of future tournaments (e.g. next Worlds).
    conn.execute("DELETE FROM team_podiums")
    conn.execute("""
        INSERT OR IGNORE INTO team_podiums
            (team_id, overview_page, event, league, year, place, place_num)
        SELECT ta.team_id, T.OverviewPage, T.Name, T.League,
               COALESCE(NULLIF(T.Year, ''), first_year(T.Name), first_year(T.OverviewPage)),
               TRIM(TR.Place),
               CASE TRIM(TR.Place) WHEN '1' THEN 1 WHEN '2' THEN 2 ELSE 3 END
        FROM tournament_results TR
        JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
        JOIN team_aliases ta ON ta.alias = TR.Team
        WHERE T.Tier = 'intl_premier'
          AND TRIM(TR.Place) IN ('1', '2', '3', '3-4')
          AND TR.Team IS NOT NULL AND TRIM(TR.Team) <> ''""")

    # -- team_index --------------------------------------------------------
    # Only teams with at least one game get a page; podium winners always qualify
    # (their rosters played). Ordered by games so big orgs keep the clean slug.
    rows = conn.execute(f"""
        SELECT team_id, COUNT(DISTINCT gid) AS games,
               COUNT(DISTINCT player_id) AS players, MIN(y) AS fy, MAX(y) AS ly
        FROM ({_TEAM_GAMES_UNION})
        GROUP BY team_id ORDER BY games DESC, team_id""").fetchall()
    podiums = {r[0]: (r[1], r[2]) for r in conn.execute("""
        SELECT team_id, COUNT(*), SUM(place = '1') FROM team_podiums GROUP BY team_id""")}
    used: set[str] = set()
    payload = []
    for r in rows:
        team_id = r["team_id"]
        slug = base = _slugify(team_id) or "team"
        i = 2
        while slug in used:
            slug = f"{base}-{i}"
            i += 1
        used.add(slug)
        meta = team_meta(team_id)
        n_podiums, n_titles = podiums.get(team_id, (0, 0))
        payload.append((
            team_id, meta["Name"] if meta and meta["Name"] else team_id, slug,
            meta["Region"] if meta else None, meta["Short"] if meta else None,
            meta["IsDisbanded"] if meta else None, team_logo(team_id),
            r["games"], r["players"], r["fy"], r["ly"], n_titles or 0, n_podiums))
    conn.execute("DELETE FROM team_index")
    conn.executemany("""
        INSERT INTO team_index
            (team_id, name, slug, region, short, is_disbanded, logo_url,
             games, players, first_year, last_year, titles, podiums)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.execute("""
        UPDATE team_aliases SET slug =
            (SELECT ti.slug FROM team_index ti WHERE ti.team_id = team_aliases.team_id)""")
    conn.commit()


def compute_champion_stats(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM champion_stats")
    # One 'all' bucket plus one bucket per role; Role has full coverage in silver,
    # so the role buckets exactly partition each champion's 'all' games.
    for role, role_filter in [("all", "")] + [(r, f"AND Role = '{r}'") for r in ROLES]:
        rows = conn.execute(f"""
            SELECT Champion AS champion, COUNT(DISTINCT GameId) AS games,
                   SUM(CASE WHEN PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
                   SUM(COALESCE(Kills, 0)) AS k, SUM(COALESCE(Deaths, 0)) AS d,
                   SUM(COALESCE(Assists, 0)) AS a, COUNT(DISTINCT Link) AS n_players
            FROM scoreboard_players
            WHERE Champion IS NOT NULL AND Champion <> '' {role_filter}
            GROUP BY Champion""").fetchall()
        payload = [(r["champion"], role, r["games"], r["wins"],
                    round(r["wins"] / r["games"], 4) if r["games"] else 0.0,
                    r["k"], r["d"], r["a"], round((r["k"] + r["a"]) / max(r["d"], 1), 4),
                    r["n_players"]) for r in rows]
        conn.executemany(
            """INSERT INTO champion_stats
               (champion, role, games, wins, win_rate, kills, deaths, assists, kda, n_players)
               VALUES (?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


# ---------------------------------------------------------------------------
def _slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return base or "player"


# Legacy Score: an interpretable greatness score (titles weigh more). Since the v1
# dataset is international, it measures greatness on the big stage. See README/plan.
LEGACY = {
    "worlds": 110, "msi": 45, "other": 25,   # points per title
    "apps": 9,                                # per Worlds appearance
    "longevity": 0.5,                         # per international game
    "perf_base": 3.0, "perf_cap": 120, "perf_scale": 0.35,  # bonus for elite intl KDA
}


def _legacy_score(worlds, msi, other, apps, intl_games, kda_intl):
    worlds, msi, other, apps = worlds or 0, msi or 0, other or 0, apps or 0
    ig, k = intl_games or 0, kda_intl or 0.0
    titles = LEGACY["worlds"] * worlds + LEGACY["msi"] * msi + LEGACY["other"] * other
    stage = LEGACY["apps"] * apps
    longevity = LEGACY["longevity"] * ig
    performance = max(0.0, k - LEGACY["perf_base"]) * min(ig, LEGACY["perf_cap"]) * LEGACY["perf_scale"]
    breakdown = {"titles": round(titles), "stage": round(stage),
                 "longevity": round(longevity), "performance": round(performance)}
    return round(titles + stage + longevity + performance), breakdown


def compute_player_index(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_index")
    rows = conn.execute("""
        SELECT pcs.player_id, pcs.display_id, pcs.games, pcs.wins, pcs.kda, pcs.win_rate,
               P.Name AS name, P.Country AS country, P.Team AS team,
               P.IsRetired AS is_retired, P.Image AS image_filename,
               (SELECT SP.Role FROM scoreboard_players SP WHERE SP.Link = pcs.player_id
                  AND SP.Role IS NOT NULL AND SP.Role <> ''
                GROUP BY SP.Role ORDER BY COUNT(*) DESC LIMIT 1) AS role,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id) AS intl_titles,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id
                  AND pt.league = 'World Championship') AS worlds_titles,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id
                  AND pt.league = 'Mid-Season Invitational') AS msi_titles,
               (SELECT COUNT(DISTINCT T.Year) FROM scoreboard_players SP
                  JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
                  WHERE SP.Link = pcs.player_id AND T.Tier = 'intl_premier'
                    AND T.League = 'World Championship') AS worlds_appearances,
               pin.games AS intl_games, pin.kda AS kda_intl
        FROM player_career_stats pcs
        LEFT JOIN players P ON P.OverviewPage = pcs.player_id
        LEFT JOIN player_career_stats pin
               ON pin.player_id = pcs.player_id AND pin.scope = 'intl_premier'
        WHERE pcs.scope = 'all'
        ORDER BY pcs.games DESC""").fetchall()
    # Regional-only players: they have OE games but never appeared at an international,
    # so Leaguepedia has no page for them — no bio, no photo, no titles, no Legacy
    # Score. Listed AFTER the Leaguepedia rows so those keep the unsuffixed slug when
    # two players share a handle.
    oe_rows = conn.execute("""
        SELECT pcs.player_id, pcs.display_id, pcs.games, pcs.wins, pcs.kda, pcs.win_rate
        FROM player_career_stats pcs
        WHERE pcs.scope = ?
          AND pcs.player_id NOT IN (SELECT player_id FROM player_career_stats WHERE scope = 'all')
        ORDER BY pcs.games DESC""", (config.OE_SCOPE_REGIONAL,)).fetchall()
    # Role and current team for those players, in one pass each rather than a
    # correlated subquery per player over 370k rows. Ordering ascending means the
    # last write per player wins: most-played position, most recent team.
    oe_position = {r[0]: r[1] for r in conn.execute(
        "SELECT player_id, position FROM oe_resolved_games "
        "WHERE is_duplicate = 0 AND position <> '' "
        "GROUP BY player_id, position ORDER BY COUNT(*)")}
    oe_team = {r[0]: r[1] for r in conn.execute(
        "SELECT player_id, teamname FROM oe_resolved_games "
        "WHERE is_duplicate = 0 AND teamname <> '' "
        "GROUP BY player_id, teamname ORDER BY MAX(year)")}

    used: set[str] = set()
    payload = []

    def take_slug(text: str) -> str:
        slug = base = _slugify(text)
        i = 2
        while slug in used:
            slug = f"{base}-{i}"
            i += 1
        used.add(slug)
        return slug

    for r in rows:
        slug = take_slug(r["display_id"] or r["player_id"])
        other = (r["intl_titles"] or 0) - (r["worlds_titles"] or 0) - (r["msi_titles"] or 0)
        score, breakdown = _legacy_score(r["worlds_titles"], r["msi_titles"], other,
                                         r["worlds_appearances"], r["intl_games"], r["kda_intl"])
        payload.append((r["player_id"], "leaguepedia", r["display_id"], slug, r["name"],
                        r["role"], r["country"], r["team"], r["is_retired"], r["games"],
                        r["wins"], r["kda"], r["win_rate"], r["intl_titles"],
                        r["worlds_titles"], r["msi_titles"], r["worlds_appearances"],
                        r["intl_games"], r["kda_intl"], score, json.dumps(breakdown),
                        r["image_filename"], cdn_image(r["image_filename"]),
                        team_logo(r["team"])))

    for r in oe_rows:
        slug = take_slug(r["display_id"] or r["player_id"])
        team = oe_team.get(r["player_id"])
        payload.append((r["player_id"], "oe", r["display_id"], slug, None,
                        OE_POSITION_TO_ROLE.get(oe_position.get(r["player_id"])), None,
                        team, None, r["games"], r["wins"], r["kda"], r["win_rate"],
                        0, 0, 0, 0, 0, None, 0, None, None, None, team_logo(team)))

    conn.executemany("""INSERT INTO player_index
        (player_id, source, display_id, slug, name, role, country, team, is_retired, games,
         wins, kda, win_rate, intl_titles, worlds_titles, msi_titles, worlds_appearances,
         intl_games, kda_intl, score, score_breakdown, image_filename, image_url, team_logo_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


def compute_score_leaderboard(conn: sqlite3.Connection, top_n: int = 200) -> None:
    rows = conn.execute(
        "SELECT player_id, display_id, score, games FROM player_index "
        "ORDER BY score DESC LIMIT ?", (top_n,)).fetchall()
    _store_leaderboard(conn, "legacy_score", "all",
                       [(r["player_id"], r["display_id"], r["score"], r["games"]) for r in rows])


# ---------------------------------------------------------------------------
def _store_leaderboard(conn, stat: str, scope: str, ranked: list[tuple]) -> None:
    conn.execute("DELETE FROM leaderboards WHERE stat=? AND scope=?", (stat, scope))
    conn.executemany(
        """INSERT INTO leaderboards (stat, scope, rank, player_id, display_id, value, games)
           VALUES (?,?,?,?,?,?,?)""",
        [(stat, scope, i + 1, pid, did, val, games)
         for i, (pid, did, val, games) in enumerate(ranked)],
    )
    conn.commit()


# per-player stats computed for each scope (all + per role)
PER_PLAYER_STATS = [
    ("career_kda", "kda", "career_kda"),
    ("games_played", "games", None),
    ("career_kills", "kills", None),
    ("win_rate", "win_rate", "win_rate"),
]


def compute_leaderboards(conn: sqlite3.Connection, top_n: int = 200) -> None:
    scopes = ["all"] + [f"role:{r}" for r in ROLES]
    for scope in scopes:
        for stat, col, thr_key in PER_PLAYER_STATS:
            thr = config.THRESHOLDS.get(thr_key) if thr_key else None
            extra = f"AND games >= {thr}" if thr else ""
            rows = conn.execute(
                f"""SELECT player_id, display_id, {col} AS value, games
                    FROM player_career_stats WHERE scope = ? {extra}
                    ORDER BY value DESC, games DESC LIMIT ?""", (scope, top_n)).fetchall()
            _store_leaderboard(conn, stat, scope,
                               [(r["player_id"], r["display_id"], r["value"], r["games"])
                                for r in rows])

    # KDA only at internationals (its own, lower threshold)
    thr = config.THRESHOLDS["career_kda_intl"]
    rows = conn.execute(
        f"""SELECT player_id, display_id, kda AS value, games FROM player_career_stats
            WHERE scope = 'intl_premier' AND games >= {thr}
            ORDER BY value DESC, games DESC LIMIT ?""", (top_n,)).fetchall()
    _store_leaderboard(conn, "career_kda_intl", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"]) for r in rows])

    # Titles and appearances
    _store_leaderboard(conn, "intl_titles", "all", _titles(conn, None, top_n))
    _store_leaderboard(conn, "worlds_titles", "all", _titles(conn, "World Championship", top_n))
    _store_leaderboard(conn, "msi_titles", "all", _titles(conn, "Mid-Season Invitational", top_n))
    _store_leaderboard(conn, "worlds_appearances", "all", _worlds_appearances(conn, top_n))


# Leaderboards computed for every OE scope.
# (stat, column, threshold key, column the threshold applies to and that is shown
#  as the sample). Economy stats rank on economy_games because a player's games and
# their games WITH timings are not the same number — see OE_MIN_COMPLETE_GAMES.
OE_STATS = [
    ("career_kda",   "kda",        "regional_kda",      "games"),
    ("games_played", "games",      None,                "games"),
    ("career_kills", "kills",      None,                "games"),
    ("win_rate",     "win_rate",   "regional_win_rate", "games"),
    ("gd15",         "gd15",       None,                "economy_games"),
    ("gold15",       "gold15",     None,                "economy_games"),
    ("cs_per_min",   "cs_per_min", "regional_kda",      "games"),
    ("dpm",          "dpm",        "regional_kda",      "games"),
    ("pentakills",   "pentakills", None,                "games"),
]


def compute_oe_leaderboards(conn: sqlite3.Connection, top_n: int = 200) -> None:
    for scope, _ in _oe_scopes(conn):
        for stat, col, thr_key, sample in OE_STATS:
            thr = config.THRESHOLDS.get(thr_key) if thr_key else (
                config.OE_MIN_COMPLETE_GAMES if sample == "economy_games" else None)
            where = f"AND {sample} >= {thr}" if thr else ""
            rows = conn.execute(
                f"""SELECT player_id, display_id, {col} AS value, {sample} AS sample
                    FROM player_career_stats
                    WHERE scope = ? AND {col} IS NOT NULL {where}
                    ORDER BY value DESC, {sample} DESC LIMIT ?""", (scope, top_n)).fetchall()
            _store_leaderboard(conn, stat, scope,
                               [(r["player_id"], r["display_id"], r["value"], r["sample"])
                                for r in rows])


def clear_oe_gold(conn: sqlite3.Connection) -> None:
    """Drop everything derived from Oracle's Elixir.

    Runs when the OE silver is absent, so a DB that once had it does not keep serving
    stale rows — a leaderboard is only ever rewritten per (stat, scope), so without
    this a 'Most pentakills' record survives with nothing behind it.
    """
    oe_scope = "(scope IN ('regional', 'intl_secondary') OR scope LIKE 'region:%')"
    conn.execute(f"DELETE FROM player_career_stats WHERE {oe_scope}")
    conn.execute(f"DELETE FROM leaderboards WHERE {oe_scope} OR stat = 'pentakills'")
    conn.execute("DELETE FROM records WHERE record_key = 'most_pentakills'")
    conn.commit()


def compute_pentakills(conn: sqlite3.Connection, top_n: int = 200) -> None:
    """Career pentakills — the ONE stat that deliberately counts duplicate games.

    Everything else filters is_duplicate = 0 because Leaguepedia is authoritative for
    those games and would otherwise be counted twice. Pentakills have no Leaguepedia
    equivalent at all, so there is nothing to double-count and dropping those games
    just loses pentakills: 31 of them were scored at Worlds and MSI, enough to move
    Peyz from 7 to 9 and into a tie with Ruler at the top.

    `games` reports the sample the count could come from — games whose pentakills
    column is populated at all. That is well short of a career for LPL players, whose
    games carry no multikill data from 2022 on.
    """
    rows = conn.execute("""
        SELECT g.player_id,
               COALESCE(
                   (SELECT P.ID FROM players P WHERE P.OverviewPage = g.player_id),
                   (SELECT pl.playername FROM oe_player_link pl WHERE pl.playerid = g.player_id),
                   g.player_id) AS display_id,
               SUM(COALESCE(g.pentakills, 0)) AS pentas,
               SUM(g.pentakills IS NOT NULL)  AS sample
        FROM oe_resolved_games g
        GROUP BY g.player_id
        HAVING pentas > 0
        ORDER BY pentas DESC, sample ASC
        LIMIT ?""", (top_n,)).fetchall()
    _store_leaderboard(conn, "pentakills", "all",
                       [(r["player_id"], r["display_id"], r["pentas"], r["sample"])
                        for r in rows])


def _titles(conn, league: str | None, top_n: int) -> list[tuple]:
    league_clause = f"AND T.League = '{league}'" if league else ""
    q = f"""
        WITH winners AS (
            SELECT TR.OverviewPage AS op, TR.PageAndTeam AS pat
            FROM tournament_results TR
            JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
            WHERE T.Tier = 'intl_premier' AND TRIM(TR.Place) = '1' {league_clause}
        ),
        winning_players AS (
            SELECT DISTINCT TP.Link AS player_id, W.op AS op
            FROM tournament_players TP
            JOIN winners W ON W.pat = TP.PageAndTeam
            WHERE TP.Link IS NOT NULL AND TP.Link <> ''
              AND EXISTS (SELECT 1 FROM scoreboard_players SP
                          WHERE SP.Link = TP.Link AND SP.OverviewPage = TP.OverviewPage)
        )
        SELECT wp.player_id, COALESCE(P.ID, wp.player_id) AS display_id,
               COUNT(DISTINCT wp.op) AS titles
        FROM winning_players wp
        LEFT JOIN players P ON P.OverviewPage = wp.player_id
        GROUP BY wp.player_id ORDER BY titles DESC LIMIT ?
    """
    rows = conn.execute(q, (top_n,)).fetchall()
    return [(r["player_id"], r["display_id"], r["titles"], None) for r in rows]


def _worlds_appearances(conn, top_n: int) -> list[tuple]:
    rows = conn.execute("""
        SELECT SP.Link AS player_id, COALESCE(P.ID, SP.Link) AS display_id,
               COUNT(DISTINCT T.Year) AS appearances
        FROM scoreboard_players SP
        JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
        LEFT JOIN players P ON P.OverviewPage = SP.Link
        WHERE T.Tier = 'intl_premier' AND T.League = 'World Championship'
          AND SP.Link IS NOT NULL AND SP.Link <> ''
        GROUP BY SP.Link ORDER BY appearances DESC LIMIT ?""", (top_n,)).fetchall()
    return [(r["player_id"], r["display_id"], r["appearances"], None) for r in rows]


# ---------------------------------------------------------------------------
RECORD_LABELS = {
    "legacy_score": "Highest smurf score",
    "intl_titles": "Most international titles",
    "worlds_titles": "Most Worlds titles",
    "msi_titles": "Most MSI titles",
    "worlds_appearances": "Most Worlds appearances",
    "games_played": "Most games played",
    "career_kills": "Most career kills",
    "career_kda_intl": "Best KDA at internationals",
    "career_kda": "Best career KDA",
    "win_rate": "Best career win rate",
    "pentakills": "Most pentakills",
}

# Records whose coverage is narrower than the label suggests. Surfaced in the
# record's context JSON so the site can say so instead of implying completeness.
RECORD_NOTES = {
    "pentakills": "Oracle's Elixir only. Games marked 'partial' carry no multikill "
                  "data, so LPL games from 2022 on are not counted.",
}


def compute_records(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM records")
    payload = []
    for stat, label in RECORD_LABELS.items():
        row = conn.execute(
            "SELECT player_id, display_id, value, games FROM leaderboards "
            "WHERE stat=? AND scope='all' AND rank=1", (stat,)).fetchone()
        if not row:
            continue
        ctx = {"games": row["games"], "threshold": config.THRESHOLDS.get(stat)}
        if stat in RECORD_NOTES:
            ctx["note"] = RECORD_NOTES[stat]
        payload.append((f"most_{stat}", label, row["player_id"], row["display_id"],
                        row["value"], json.dumps(ctx, ensure_ascii=False)))
    conn.executemany(
        """INSERT OR REPLACE INTO records (record_key, label, ref_id, display_id, value, context)
           VALUES (?,?,?,?,?,?)""", payload)
    conn.commit()


def run_all(conn: sqlite3.Connection) -> None:
    compute_tiers(conn)
    compute_career_stats(conn)
    # Oracle's Elixir scopes, only when its silver has been ingested (etl.oe_ingest).
    has_oe = _has_oe(conn)
    if has_oe:
        compute_oe_career_stats(conn)
    else:
        clear_oe_gold(conn)
    compute_player_titles(conn)
    compute_player_teams(conn)
    compute_player_champions(conn)
    compute_champion_stats(conn)
    compute_leaderboards(conn)
    if has_oe:
        compute_oe_leaderboards(conn)
        compute_pentakills(conn)
    compute_player_index(conn)
    compute_teams(conn)
    compute_score_leaderboard(conn)
    compute_records(conn)


def main() -> None:
    """Recompute the GOLD layer only — pure SQL over existing silver, no network."""
    from etl import db

    conn = db.connect()
    db.apply_schema(conn)
    run_all(conn)
    for tbl in ("player_career_stats", "player_champions", "champion_stats",
                "leaderboards", "records", "player_index", "team_index"):
        count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        print(f"  {tbl:22s} {count:7d}")
    conn.close()


if __name__ == "__main__":
    main()
