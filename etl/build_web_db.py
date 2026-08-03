"""Produce a 'slim' SQLite with only the GOLD tables (the ones the web reads) from
the ETL DB. Much smaller -> it gets committed and serves the Cloudflare build.

    python -m etl.build_web_db
"""
from __future__ import annotations

import shutil
import sqlite3

from etl import config

WEB_DB = config.DATA_DIR / "web.sqlite"
# The tables the web reads. An ALLOWLIST, not a list of silver tables to drop: a
# blacklist has to be updated for every new silver table, and forgetting one ships
# it to the edge unnoticed (Oracle's Elixir alone adds ~1.4M rows of silver).
KEEP_TABLES = {
    "player_index", "player_career_stats", "player_champions", "player_teams",
    "player_titles", "champion_stats", "leaderboards", "records",
    "team_index", "team_aliases", "team_rosters", "team_podiums",
    "oe_leagues",   # 25-row dimension: region labels for the regional scopes
    "etl_meta",
}
# Champions kept per player. The player page renders 12; the margin leaves room to
# show a few more without another ETL change.
CHAMPION_POOL_KEPT = 16


def main() -> None:
    shutil.copyfile(config.DB_PATH, WEB_DB)
    for suffix in ("-wal", "-shm"):
        p = WEB_DB.with_name(WEB_DB.name + suffix)
        if p.exists():
            p.unlink()
    conn = sqlite3.connect(WEB_DB)
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    for t in tables:
        if t not in KEEP_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
    # the ETL checkpoints are not useful in the web
    conn.execute("""DELETE FROM etl_meta WHERE key LIKE 'loaded:%' OR key LIKE 'sweep:%'
                    OR key LIKE 'month:%' OR key LIKE 'meta:%' OR key LIKE 'year:%'""")
    # Champion pools: the player page shows the top 12, but the ETL stores every
    # champion a player ever picked — 43k rows across 3.8k players, nearly half of
    # this file once regional players joined the index. This DB is committed on
    # every data refresh, so the tail costs a new blob in git history each time.
    conn.execute(f"""
        DELETE FROM player_champions WHERE rowid NOT IN (
            SELECT rowid FROM (
                SELECT rowid, ROW_NUMBER() OVER (
                    PARTITION BY player_id ORDER BY games DESC, champion) AS rn
                FROM player_champions)
            WHERE rn <= {CHAMPION_POOL_KEPT})""")
    conn.commit()
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("VACUUM")
    conn.close()
    print(f"[web-db] {WEB_DB}  {WEB_DB.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
