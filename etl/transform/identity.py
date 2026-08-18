"""Canonical player identity: one profile per person, whatever the wiki typed.

`ScoreboardPlayers.Link` is supposed to be the player's page
(`Players.OverviewPage`), but Cargo returns whatever an editor typed on the match
page. `Yagao`, `YaGao` and `yagao` all arrive verbatim and only one of them is a
real page, so grouping by `Link` splits a single career across several profiles:
on the 2026-08 backfill that was **8.600 variants over 275k player-game rows**,
about a fifth of the dataset (Xiye alone lost 826 games to a phantom twin).

This module builds `player_link_map` (every Link ever seen -> the canonical
player_id) and the `*_canon` tables the gold reads instead of the raw silver
ones. Silver stays verbatim, which is the rule for this layer; the
normalization lives here, in the transform, where it can be re-run and audited.

Resolution, in descending order of confidence:

  page       the Link *is* a player page
  redirect   the Link is a declared alias (PlayerRedirects)
  page_ci    it matches exactly one page ignoring case, spacing and underscores
  redirect_ci  same, against the redirect table
  cluster    no page at all: the variants are merged onto the most played one
  ambiguous  two different pages share the normalized form -> left untouched

Only `page` is trusted blindly; everything else is counted in the summary so a
bad wiki edit shows up as a number instead of a silent merge.
"""
from __future__ import annotations

import re
import sqlite3
from collections import defaultdict

# Sources of Link values that must all agree on the same canonical id.
LINK_SOURCES = (
    ("scoreboard_players", "Link"),
    ("tournament_players", "Link"),
    ("oe_player_link", "link"),
)

# MediaWiki treats underscores as spaces and only capitalizes the first letter,
# so those differences never mean two different people.
_norm_re = re.compile(r"[\s_]+")


def normalize(link: str) -> str:
    return _norm_re.sub(" ", (link or "").strip()).casefold()


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
        (name,)).fetchone() is not None


def _collect_links(conn: sqlite3.Connection) -> dict[str, int]:
    """Every Link value in play, with how many rows hang off it (the tie-breaker)."""
    counts: dict[str, int] = defaultdict(int)
    for table, column in LINK_SOURCES:
        if not _table_exists(conn, table):
            continue
        for link, n in conn.execute(
                f"SELECT {column}, COUNT(*) FROM {table} "
                f"WHERE {column} IS NOT NULL AND {column} <> '' GROUP BY {column}"):
            counts[link] += n
    return counts


def build_link_map(conn: sqlite3.Connection) -> dict[str, int]:
    pages = [r[0] for r in conn.execute("SELECT OverviewPage FROM players")]
    page_set = set(pages)
    pages_ci: dict[str, set[str]] = defaultdict(set)
    for page in pages:
        pages_ci[normalize(page)].add(page)

    redirects = dict(conn.execute(
        "SELECT AllName, OverviewPage FROM player_redirects "
        "WHERE AllName IS NOT NULL AND OverviewPage IS NOT NULL"))
    redirects_ci: dict[str, set[str]] = defaultdict(set)
    for alias, target in redirects.items():
        redirects_ci[normalize(alias)].add(target)

    counts = _collect_links(conn)
    resolved: dict[str, tuple[str, str]] = {}   # link -> (player_id, method)
    leftovers: dict[str, list[str]] = defaultdict(list)

    for link in counts:
        if link in page_set:
            resolved[link] = (link, "page")
            continue
        target = redirects.get(link)
        if target:
            resolved[link] = (target, "redirect")
            continue
        key = normalize(link)
        page_hits, redirect_hits = pages_ci.get(key), redirects_ci.get(key)
        if page_hits and len(page_hits) == 1:
            resolved[link] = (next(iter(page_hits)), "page_ci")
        elif page_hits:
            resolved[link] = (link, "ambiguous")
        elif redirect_hits and len(redirect_hits) == 1:
            resolved[link] = (next(iter(redirect_hits)), "redirect_ci")
        elif redirect_hits:
            resolved[link] = (link, "ambiguous")
        else:
            leftovers[key].append(link)

    # No page anywhere: keep the person as one profile anyway. MediaWiki always
    # capitalizes the first letter of a title, so a lowercase-initial spelling is
    # never a page name -- prefer a capitalized variant, then the most played one.
    for variants in leftovers.values():
        canonical = max(variants, key=lambda v: (v[:1].isupper(), counts[v], v))
        for link in variants:
            resolved[link] = (canonical, "cluster")

    conn.execute("DELETE FROM player_link_map")
    conn.executemany(
        "INSERT INTO player_link_map (link, player_id, method, rows) VALUES (?,?,?,?)",
        [(link, pid, method, counts[link]) for link, (pid, method) in resolved.items()])
    conn.commit()

    summary: dict[str, int] = defaultdict(int)
    moved_rows = 0
    for link, (pid, method) in resolved.items():
        summary[method] += 1
        if pid != link:
            moved_rows += counts[link]
    summary["links"] = len(resolved)
    summary["rows_reattributed"] = moved_rows
    summary["players"] = len({pid for pid, _ in resolved.values()})
    return dict(summary)


# `Link` is replaced in place so the gold keeps reading a column with the same
# name; every other column passes through untouched.
_SCOREBOARD_COLUMNS = (
    "UniqueLine", "Name", "Champion", "Kills", "Deaths", "Assists", "Gold", "CS",
    "DamageToChampions", "VisionScore", "Role", "Role_Number", "Side", "Team",
    "TeamKills", "PlayerWin", "DateTime_UTC", "Tournament", "OverviewPage",
    "GameId", "MatchId",
)
_TOURNAMENT_PLAYER_COLUMNS = (
    "OverviewPage", "Team", "Player", "Role", "PageAndTeam", "N_PlayerInTeam",
    "TeamOrder",
)


def _materialize(conn, name: str, table: str, columns: tuple[str, ...],
                 link_col: str, indexes: tuple[tuple[str, ...], ...]) -> int:
    """Rebuild `name` as a real table, not a view.

    A view would be the obvious choice, but `Link` becomes a COALESCE over a join
    there, so SQLite cannot use an index for it: the correlated `WHERE SP.Link =
    TP.Link` subqueries in the gold degrade to a full scan of 1.35M rows each and
    run_all goes from minutes to hours. Same lesson `oe_resolved_games` learned.
    """
    conn.execute(f"DROP VIEW IF EXISTS {name}")
    conn.execute(f"DROP TABLE IF EXISTS {name}")
    passthrough = ", ".join(f"S.{c}" for c in columns)
    conn.execute(f"""
        CREATE TABLE {name} AS
        SELECT COALESCE(M.player_id, S.{link_col}) AS {link_col}, {passthrough}
        FROM {table} S
        LEFT JOIN player_link_map M ON M.link = S.{link_col}""")
    for cols in indexes:
        conn.execute(f"CREATE INDEX idx_{name}_{'_'.join(c.lower() for c in cols)} "
                     f"ON {name}({', '.join(cols)})")
    return conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]


def create_canon_tables(conn: sqlite3.Connection) -> dict[str, int]:
    counts = {
        "scoreboard_players_canon": _materialize(
            conn, "scoreboard_players_canon", "scoreboard_players",
            _SCOREBOARD_COLUMNS, "Link",
            (("Link",), ("OverviewPage",), ("GameId",), ("Champion",))),
        "tournament_players_canon": _materialize(
            conn, "tournament_players_canon", "tournament_players",
            _TOURNAMENT_PLAYER_COLUMNS, "Link",
            (("Link",), ("OverviewPage",), ("PageAndTeam",))),
    }
    conn.commit()
    return counts


def canonicalize_oe(conn: sqlite3.Connection) -> int:
    """Point the Oracle's Elixir crosswalk at canonical ids too.

    Its `link` was matched against raw scoreboard rows, so it inherited the same
    variants; leaving it alone would split a career right back into two on the
    regional scopes. Both tables are derived, so rewriting them is idempotent.
    """
    moved = 0
    for table, column in (("oe_player_link", "link"), ("oe_resolved_games", "player_id")):
        if not _table_exists(conn, table):
            continue
        cur = conn.execute(f"""
            UPDATE {table} SET {column} = (
                SELECT M.player_id FROM player_link_map M WHERE M.link = {table}.{column})
            WHERE {column} IN (
                SELECT link FROM player_link_map WHERE link <> player_id)""")
        moved += cur.rowcount
    conn.commit()
    return moved


def run(conn: sqlite3.Connection) -> dict[str, int]:
    summary = build_link_map(conn)
    summary.update(create_canon_tables(conn))
    summary["oe_rows_repointed"] = canonicalize_oe(conn)
    return summary


# --- audit ----------------------------------------------------------------
# The point of the map is that a split identity becomes a number instead of a
# silent duplicate. These two checks run at the end of every gold rebuild.
def audit(conn: sqlite3.Connection) -> list[str]:
    warnings: list[str] = []

    orphans = conn.execute("""
        SELECT pi.player_id, cs.games
        FROM player_index pi
        JOIN player_career_stats cs
          ON cs.player_id = pi.player_id AND cs.scope = 'all'
        LEFT JOIN players p ON p.OverviewPage = pi.player_id
        WHERE p.OverviewPage IS NULL AND pi.source = 'leaguepedia'
        ORDER BY cs.games DESC LIMIT 5""").fetchall()
    total_orphans = conn.execute("""
        SELECT COUNT(*) FROM player_index pi
        LEFT JOIN players p ON p.OverviewPage = pi.player_id
        WHERE p.OverviewPage IS NULL AND pi.source = 'leaguepedia'""").fetchone()[0]
    if total_orphans:
        top = ", ".join(f"{r[0]} ({r[1]}g)" for r in orphans)
        warnings.append(
            f"{total_orphans} profiles have no Leaguepedia page behind them "
            f"(worst: {top}). Either the wiki page is missing or the Link needs a rule.")

    collisions = conn.execute("""
        SELECT LOWER(name) k, COUNT(*) n, GROUP_CONCAT(team_id, ' | ')
        FROM team_index GROUP BY k HAVING n > 1 ORDER BY n DESC LIMIT 5""").fetchall()
    if collisions:
        warnings.append(
            f"{len(collisions)} team names are shared by more than one org: " +
            "; ".join(f"{r[2]}" for r in collisions) +
            ". Fine when they really are different clubs (NiP vs NiP.CN), a merge "
            "to make when they are not.")
    return warnings
