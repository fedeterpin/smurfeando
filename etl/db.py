"""SQLite helpers: connection, schema application, coercion and upsert."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from etl import config

_TRUTHY = {"1", "yes", "true", "y", "t"}
_FALSY = {"0", "no", "false", "n", "f"}


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    return conn


# Columns added to tables that already exist in the wild. schema.sql only runs
# CREATE TABLE IF NOT EXISTS, so an existing DB never picks them up on its own and
# a full re-extract would mean re-crawling Cargo. Applied idempotently on every
# apply_schema; keep in sync with db/schema.sql.
MIGRATIONS: list[tuple[str, str, str]] = [
    ("oe_player_link", "method", "TEXT"),
    ("player_career_stats", "economy_games", "INTEGER"),
    ("player_career_stats", "gd15", "REAL"),
    ("player_career_stats", "gold15", "REAL"),
    ("player_career_stats", "cs_per_min", "REAL"),
    ("player_career_stats", "dpm", "REAL"),
    ("player_career_stats", "pentakills", "INTEGER"),
    ("player_index", "source", "TEXT"),
    ("oe_resolved_games", "is_duplicate", "INTEGER"),
]


# Names that used to be a VIEW and are now a TABLE. SQLite refuses DROP VIEW on a
# table and CREATE TABLE IF NOT EXISTS silently no-ops when a view holds the name, so
# the stale object has to be removed before the schema runs.
LEGACY_VIEWS = ["oe_resolved_games"]


# Gold tables whose shape changed in a way ALTER cannot express (a new column that is
# part of the PRIMARY KEY). They are derived and fully recomputed by every transform,
# so a stale copy is simply dropped before the schema runs and recreated from
# db/schema.sql. (table, column the current shape requires)
STALE_GOLD: list[tuple[str, str]] = [("champion_stats", "role")]


def apply_schema(conn: sqlite3.Connection, schema_path: Path | None = None) -> None:
    for name in LEGACY_VIEWS:
        row = conn.execute(
            "SELECT type FROM sqlite_master WHERE name = ?", (name,)).fetchone()
        if row and row[0] == "view":
            conn.execute(f"DROP VIEW {name}")
    for table, column in STALE_GOLD:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,)).fetchone()
        if row and column not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"DROP TABLE {table}")
    sql = (schema_path or config.SCHEMA_PATH).read_text(encoding="utf-8")
    conn.executescript(sql)
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'")}
    for table, column, decl in MIGRATIONS:
        if table not in tables:
            continue  # freshly created from schema.sql, already has it
        if column not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    conn.commit()


def _coerce_value(spec: config.TableSpec, field: str, raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if field in spec.bool_fields:
        low = s.lower()
        if low in _TRUTHY:
            return 1
        if low in _FALSY or s == "":
            return 0 if s != "" else None
        return None
    if s == "":
        return None
    if field in spec.int_fields:
        try:
            return int(float(s))  # tolerates "3" and "3.0"
        except ValueError:
            return None
    if field in spec.float_fields:
        try:
            return float(s)
        except ValueError:
            return None
    return s


def coerce_row(spec: config.TableSpec, row: dict) -> tuple:
    return tuple(_coerce_value(spec, f, row.get(f)) for f in spec.fields)


def upsert_rows(conn: sqlite3.Connection, spec: config.TableSpec, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = ", ".join(spec.fields)
    placeholders = ", ".join("?" for _ in spec.fields)
    sql = f"INSERT OR REPLACE INTO {spec.name} ({cols}) VALUES ({placeholders})"
    data = [coerce_row(spec, r) for r in rows]
    conn.executemany(sql, data)
    conn.commit()
    return len(data)


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT OR REPLACE INTO etl_meta (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
