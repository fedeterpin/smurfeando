"""Source-encoding cleanup for the gold layer.

Leaguepedia stores wiki escapes inside otherwise plain fields: 1.519 player names
carry a literal `&nbsp;` (`Matías&nbsp;Nicolás Bravo`) and one team is genuinely
called `&#x2f;&#x2f;games`. React escapes what it renders, so the entity reaches
the page as visible text.

Decoding once at the end of the gold rebuild fixes every table at the same time,
including fields nobody has added yet. Key columns are skipped: they are matched
back against raw Cargo values (`player_link_map.link`) or used as URLs and joins
(`slug`, `*_id`), so rewriting them would break the very lookups they exist for.
"""
from __future__ import annotations

import html
import re
import sqlite3

# Anything shaped like an entity; the cheap LIKE below is the first filter.
ENTITY = re.compile(r"&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});")

# Identifiers and URLs: never touched. `alias` IS cleaned, so the live slice has
# to clean the names it looks up too (etl/live.py does).
SKIP_COLUMNS = {
    "player_id", "team_id", "ref_id", "record_key", "link", "slug", "team_slug",
    "overview_page", "stat", "scope", "key", "value", "source", "method",
    "image_url", "team_logo_url", "logo_url", "image_filename", "score_breakdown",
}

GOLD_TABLES = (
    "player_index", "player_career_stats", "player_champions", "player_teams",
    "player_titles", "champion_stats", "leaderboards", "records",
    "team_index", "team_aliases", "team_rosters", "team_podiums", "oe_leagues",
)


def clean(text: str | None) -> str | None:
    """Decode entities and normalize the invisible characters they hide."""
    if not text or "&" not in text:
        return text
    decoded = html.unescape(text)
    if decoded == text:
        return text
    # A non-breaking space is a space to a reader, and a zero-width space is
    # nothing at all; keeping them would just move the bug from visible to subtle.
    return decoded.replace(" ", " ").replace("​", "").strip()


def unescape_gold(conn: sqlite3.Connection) -> dict[str, int]:
    """Rewrites every display column that still carries a source escape."""
    fixed: dict[str, int] = {}
    for table in GOLD_TABLES:
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")
                if r[2].upper().startswith("TEXT") and r[1].lower() not in SKIP_COLUMNS]
        if not cols:
            continue
        for col in cols:
            rows = conn.execute(
                f"SELECT rowid, {col} FROM {table} "
                f"WHERE {col} LIKE '%&%;%'").fetchall()
            updates = [(clean(v), rid) for rid, v in rows if v and ENTITY.search(v)]
            updates = [(new, rid) for new, rid in updates if new is not None]
            if updates:
                conn.executemany(f"UPDATE {table} SET {col} = ? WHERE rowid = ?", updates)
                fixed[f"{table}.{col}"] = len(updates)
    conn.commit()
    return fixed
